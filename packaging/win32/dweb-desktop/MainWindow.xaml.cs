using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Input;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;

namespace DwebDesktop;

public partial class MainWindow : Window
{
    private const string DwebUrl = "http://localhost:49737";
    private const string WslProcessName = "wsl.exe";
    private bool _isNavigating;

    public MainWindow()
    {
        InitializeComponent();
        DataContext = this;
    }

    #region WebView2 Event Handlers

    private void OnWebView2Initialized(object? sender, CoreWebView2InitializationCompletedEventArgs e)
    {
        if (!e.IsSuccess)
        {
            ShowError($"WebView2 initialization failed: {e.InitializationException?.Message}");
            return;
        }

        ConfigureWebView2();
        HideLoadingOverlay();
    }

    private void ConfigureWebView2()
    {
        var settings = DwebWebView.CoreWebView2.Settings;
        settings.IsScriptEnabled = true;
        settings.IsWebMessageEnabled = true;
        settings.AreDefaultScriptDialogsEnabled = false;
        settings.IsPasswordAutosaveEnabled = false;
        settings.IsGeneralAutofillEnabled = false;

        DwebWebView.CoreWebView2.NewWindowRequested += OnNewWindowRequested;
        DwebWebView.CoreWebView2.DocumentTitleChanged += OnDocumentTitleChanged;
        DwebWebView.CoreWebView2.SourceChanged += OnCoreSourceChanged;
        DwebWebView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;

        DwebWebView.CoreWebView2.AddHostObjectToScript("dwebBridge", new DwebBridge());
    }

    private void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        _isNavigating = true;

        if (e.IsRedirect || !e.Uri.StartsWith(DwebUrl))
        {
            return;
        }

        SetStatus("Loading...");
    }

    private void OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        _isNavigating = false;

        if (e.IsSuccess)
        {
            SetStatus("Ready");
        }
        else
        {
            SetStatus($"Navigation failed: {e.WebErrorStatus}");
            if (!DwebWebView.CoreWebView2.Source.StartsWith(DwebUrl))
            {
                NavigateToDweb();
            }
        }
    }

    private void OnSourceChanged(object? sender, CoreWebView2SourceChangedEventArgs e)
    {
        if (!e.IsNewDocument) return;
    }

    private void OnCoreSourceChanged(object? sender, CoreWebView2SourceChangedEventArgs e)
    {
        var currentUrl = DwebWebView.CoreWebView2.Source;
        if (!string.IsNullOrEmpty(currentUrl) && !currentUrl.StartsWith(DwebUrl))
        {
            var result = MessageBox.Show(
                $"Open this URL in your system browser?\n\n{currentUrl}",
                "External URL",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);

            if (result == MessageBoxResult.Yes)
            {
                OpenInSystemBrowser(currentUrl);
            }

            NavigateToDweb();
        }
    }

    private void OnNewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        OpenInSystemBrowser(e.Uri);
        e.Handled = true;
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        var message = e.TryGetWebMessageAsString();
        Debug.WriteLine($"[dweb] Web message: {message}");
    }

    private void OnWebViewKeyDown(object? sender, KeyEventArgs e)
    {
        if (Keyboard.Modifiers == ModifierKeys.Control)
        {
            switch (e.Key)
            {
                case Key.T:
                    OpenInSystemBrowser(DwebUrl);
                    e.Handled = true;
                    break;
                case Key.W:
                    Close();
                    e.Handled = true;
                    break;
                case Key.R:
                    NavigateToDweb();
                    e.Handled = true;
                    break;
                case Key.L:
                    DwebWebView.CoreWebView2?.ExecuteScriptAsync("document.querySelector('input[type=url]')?.focus()");
                    e.Handled = true;
                    break;
            }
        }
    }

    #endregion

    #region Window Management

    private async void OnClosing(object? sender, CancelEventArgs e)
    {
        if (await IsWslRunning())
        {
            var result = MessageBox.Show(
                "The dweb WSL backend is still running. Close anyway?",
                "dweb Desktop",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning);

            if (result == MessageBoxResult.No)
            {
                e.Cancel = true;
                return;
            }
        }

        CleanupWebView2();
    }

    public void NavigateToDweb()
    {
        DwebWebView.CoreWebView2?.Navigate(DwebUrl);
    }

    private void ShowError(string message)
    {
        LoadingText.Text = "Error";
        SetStatus(message);
        Dispatcher.InvokeAsync(() =>
        {
            MessageBox.Show(message, "dweb Desktop Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }, DispatcherPriority.Normal);
    }

    private void HideLoadingOverlay()
    {
        LoadingOverlay.Visibility = Visibility.Collapsed;
    }

    private void SetStatus(string text)
    {
        StatusText.Text = text;
        StatusBarPanel.Visibility = Visibility.Visible;
    }

    #endregion

    #region WSL Detection

    private static async Task<bool> IsWslRunning()
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "wsl.exe",
                Arguments = "--list --running",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                CreateNoWindow = true
            };

            using var process = Process.Start(psi);
            if (process is null) return false;

            var output = await process.StandardOutput.ReadToEndAsync();
            await process.WaitForExitAsync();
            return output.Contains("dweb", StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    #endregion

    #region Helpers

    private static void OpenInSystemBrowser(string url)
    {
        try
        {
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true
                });
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Failed to open URL: {ex.Message}");
        }
    }

    private void CleanupWebView2()
    {
        try
        {
            DwebWebView.Dispose();
        }
        catch
        {
            // Swallow cleanup exceptions during shutdown
        }
    }

    #endregion

    #region Commands

    public ICommand ReloadCommand => new RelayCommand(_ => NavigateToDweb());

    public ICommand ToggleDevToolsCommand => new RelayCommand(_ =>
    {
        DwebWebView.CoreWebView2?.OpenDevToolsWindow();
    });

    #endregion
}

public class DwebBridge
{
    public string GetPlatform() => "win32";
    public string GetVersion() => "1.0.0";
}

public class RelayCommand : ICommand
{
    private readonly Action<object?> _execute;

    public RelayCommand(Action<object?> execute) => _execute = execute;

    public event EventHandler? CanExecuteChanged
    {
        add => CommandManager.RequerySuggested += value;
        remove => CommandManager.RequerySuggested -= value;
    }

    public bool CanExecute(object? parameter) => true;
    public void Execute(object? parameter) => _execute(parameter);
}
