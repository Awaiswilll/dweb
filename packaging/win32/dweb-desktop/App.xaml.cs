using System;
using System.Diagnostics;
using System.Threading;
using System.Windows;

namespace DwebDesktop;

public partial class App : Application
{
    private static readonly string MutexName = "DwebDesktopSingleInstance";
    private Mutex? _instanceMutex;
    private bool _ownsMutex;

    private void OnStartup(object sender, StartupEventArgs e)
    {
        _instanceMutex = new Mutex(true, MutexName, out _ownsMutex);

        if (!_ownsMutex)
        {
            MessageBox.Show(
                "dweb Desktop is already running.",
                "dweb Desktop",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
            Shutdown();
            return;
        }

        AppDomain.CurrentDomain.UnhandledException += (_, args) =>
        {
            LogException(args.ExceptionObject as Exception);
        };

        DispatcherUnhandledException += (_, args) =>
        {
            LogException(args.Exception);
            args.Handled = true;
        };

        MainWindow = new MainWindow();
        MainWindow.Show();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        if (_ownsMutex)
        {
            _instanceMutex?.ReleaseMutex();
        }
        _instanceMutex?.Dispose();
        base.OnExit(e);
    }

    private static void LogException(Exception? ex)
    {
        if (ex is null) return;
        try
        {
            var logPath = System.IO.Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "dweb",
                "crash.log");
            var dir = System.IO.Path.GetDirectoryName(logPath);
            if (dir is not null) System.IO.Directory.CreateDirectory(dir);
            System.IO.File.AppendAllText(logPath,
                $"[{DateTime.UtcNow:O}] {ex.GetType().Name}: {ex.Message}{Environment.NewLine}{ex.StackTrace}{Environment.NewLine}");
        }
        catch
        {
            // Silently fail if logging itself crashes
        }
    }
}
