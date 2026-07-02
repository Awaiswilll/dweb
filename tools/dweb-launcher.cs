// ═══════════════════════════════════════════════════════════════
//  dweb Desktop Launcher v0.1.0
//  Launches the Node.js dweb-server in a console window
//  Copy to the same folder as dweb-server.cjs and dist/
// ═══════════════════════════════════════════════════════════════

using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

class DwebLauncher
{
    static string FindExeDir()
    {
        // If running as a standalone exe, this is the exe path
        // In .NET Framework, Assembly location may give us the right dir
        string path = AppDomain.CurrentDomain.BaseDirectory;
        if (Directory.Exists(path)) return path;
        return Directory.GetCurrentDirectory();
    }

    static string FindNode()
    {
        // Look for node.exe in common locations
        string[] candidates = {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles) + " (x86)", "nodejs", "node.exe"),
            @"C:\Program Files\nodejs\node.exe",
            @"C:\Program Files (x86)\nodejs\node.exe",
        };
        foreach (var c in candidates)
            if (File.Exists(c)) return c;

        // Check PATH
        try
        {
            var psi = new ProcessStartInfo("where", "node") { RedirectStandardOutput = true, UseShellExecute = false };
            var p = Process.Start(psi);
            if (p != null)
            {
                string line = p.StandardOutput.ReadLine();
                p.WaitForExit(3000);
                if (!string.IsNullOrEmpty(line) && File.Exists(line))
                    return line;
            }
        }
        catch { }

        return null;
    }

    static void PrintBanner(string exeDir, string nodePath)
    {
        string toolsDir = Path.Combine(exeDir, "tools");
        string distDir = Path.Combine(exeDir, "dist");

        Console.WriteLine();
        Console.WriteLine(@"  ╔══════════════════════════════════════════════════╗");
        Console.WriteLine(@"  ║          dweb Desktop App v0.1.0               ║");
        Console.WriteLine(@"  ║          ────────────────────────               ║");
        Console.WriteLine(@"  ╚══════════════════════════════════════════════════╝");
        Console.WriteLine();
        Console.WriteLine("  Node.js   : " + (nodePath ?? "NOT FOUND"));
        Console.WriteLine("  Working   : " + exeDir);
        Console.WriteLine("  dist/     : " + (Directory.Exists(distDir) ? "✓ " + distDir : "✗ NOT FOUND"));
        Console.WriteLine("  server.js : " + (File.Exists(Path.Combine(toolsDir, "dweb-server.cjs")) ? "✓ Found" : "✗ NOT FOUND"));
        Console.WriteLine();
    }

    static string GetLocalIPs()
    {
        var sb = new StringBuilder();
        foreach (var iface in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (iface.OperationalStatus != OperationalStatus.Up) continue;
            if (iface.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
            foreach (var ip in iface.GetIPProperties().UnicastAddresses)
            {
                if (ip.Address.AddressFamily == AddressFamily.InterNetwork)
                {
                    if (sb.Length > 0) sb.Append(", ");
                    sb.Append(ip.Address);
                }
            }
        }
        return sb.Length > 0 ? sb.ToString() : "127.0.0.1";
    }

    static void Main()
    {
        string exeDir = FindExeDir();
        string nodePath = FindNode();
        string toolsDir = Path.Combine(exeDir, "tools");
        string serverScript = Path.Combine(toolsDir, "dweb-server.cjs");

        Console.Title = "dweb Desktop App";
        PrintBanner(exeDir, nodePath);

        if (nodePath == null)
        {
            Console.WriteLine("  ✗ ERROR: Node.js is not installed!");
            Console.WriteLine();
            Console.WriteLine("  Download from: https://nodejs.org/");
            Console.WriteLine();
            Console.WriteLine("  Press any key to exit...");
            Console.ReadKey();
            return;
        }

        if (!File.Exists(serverScript))
        {
            Console.WriteLine("  ✗ ERROR: dweb-server.cjs not found!");
            Console.WriteLine("  Expected at: " + serverScript);
            Console.WriteLine();
            Console.WriteLine("  Press any key to exit...");
            Console.ReadKey();
            return;
        }

        if (!Directory.Exists(Path.Combine(exeDir, "dist")))
        {
            Console.WriteLine("  ✗ ERROR: dist/ folder not found!");
            Console.WriteLine("  Build the frontend first: npm run build");
            Console.WriteLine();
            Console.WriteLine("  Press any key to exit...");
            Console.ReadKey();
            return;
        }

        Console.WriteLine("  Your IPs  : " + GetLocalIPs());
        Console.WriteLine();
        Console.WriteLine("  Starting server...");

        Process proc = new Process();
        proc.StartInfo.FileName = nodePath;
        proc.StartInfo.Arguments = "\"" + serverScript + "\"";
        proc.StartInfo.UseShellExecute = false;
        proc.StartInfo.WorkingDirectory = exeDir;

        try
        {
            proc.Start();
            proc.WaitForExit();
        }
        catch (Exception ex)
        {
            Console.WriteLine("  ✗ Failed to start server:");
            Console.WriteLine("    " + ex.Message);
            Console.WriteLine();
            Console.WriteLine("  Press any key to exit...");
            Console.ReadKey();
        }
    }
}
