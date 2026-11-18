using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace BirArtiBir.Desktop;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new DesktopWindow());
    }
}

internal sealed class DesktopWindow : Form
{
    private const string SiteUrl = "https://birartibir.online/";
    private const string RuntimeInstaller = "https://developer.microsoft.com/microsoft-edge/webview2/";
    private readonly WebView2 webView = new() { Dock = DockStyle.Fill };
    private readonly Timer keyboardTimer = new() { Interval = 20 };
    private readonly JavaScriptSerializer json = new();
    private readonly PushToTalk pushToTalk;
    private readonly VoiceOverlay overlay = new();
    private OverlaySnapshot? overlaySnapshot;
    private readonly ToolStripMenuItem overlaySetting = new("Oyun göstergesi") { Checked = true, CheckOnClick = true };
    private int overlayLastUpdate;
    private CoreWebView2? web;
    private bool? microphoneAllowed;

    internal DesktopWindow()
    {
        Text = "Bir Artı Bir";
        ClientSize = new Size(1180, 800);
        MinimumSize = new Size(680, 520);
        StartPosition = FormStartPosition.CenterScreen;
        var menu = new MenuStrip();
        var viewMenu = new ToolStripMenuItem("Görünüm");
        viewMenu.DropDownItems.Add(overlaySetting);
        menu.Items.Add(viewMenu);
        MainMenuStrip = menu;
        Controls.Add(webView);
        Controls.Add(menu);
        overlaySetting.CheckedChanged += (_, _) => RefreshOverlay(force: true);
        pushToTalk = new PushToTalk(PostPushToTalk);
        keyboardTimer.Tick += (_, _) =>
        {
            ReadForegroundKey();
            RefreshOverlay();
        };
        Shown += async (_, _) => await InitializeSiteAsync();
        FormClosing += (_, _) =>
        {
            keyboardTimer.Stop();
            pushToTalk.Suspend();
        };
        FormClosed += (_, _) =>
        {
            overlay.Dispose();
            keyboardTimer.Dispose();
        };
    }

    private async System.Threading.Tasks.Task InitializeSiteAsync()
    {
        try
        {
            var profile = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "BirArtiBir", "WebView2");
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: profile);
            await webView.EnsureCoreWebView2Async(environment);
            if (IsDisposed) return;

            web = webView.CoreWebView2;
            web.Settings.AreHostObjectsAllowed = false;
            web.Settings.AreDevToolsEnabled = false;
            web.NavigationStarting += (_, args) =>
            {
                if (IsSite(args.Uri))
                {
                    ClearPageState();
                    return;
                }
                args.Cancel = true;
                if (args.IsUserInitiated) OpenBrowser(args.Uri);
            };
            web.NewWindowRequested += (_, args) =>
            {
                args.Handled = true;
                if (args.IsUserInitiated) OpenBrowser(args.Uri);
            };
            web.PermissionRequested += (_, args) => HandlePermission(args);
            web.WebMessageReceived += (_, args) =>
            {
                if (!IsSite(args.Source) || !IsSite(web.Source)) return;
                try
                {
                    var message = args.TryGetWebMessageAsString();
                    if (message.StartsWith("overlay:", StringComparison.Ordinal))
                        ReceiveOverlay(message.Substring(8));
                    else pushToTalk.Configure(message.Length == 0 ? null : message);
                }
                catch (ArgumentException) { }
            };
            web.ProcessFailed += (_, _) => ClearPageState();

            using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("site-bridge.js")
                ?? throw new InvalidOperationException("Web bağlantısı yüklenemedi.");
            using var reader = new StreamReader(stream);
            await web.AddScriptToExecuteOnDocumentCreatedAsync(reader.ReadToEnd());
            if (IsDisposed) return;

            web.Navigate(SiteUrl);
            keyboardTimer.Start();
        }
        catch (WebView2RuntimeNotFoundException)
        {
            if (IsDisposed) return;
            if (MessageBox.Show(this, "Microsoft Edge WebView2 Runtime gerekli. İndirme sayfası açılsın mı?",
                    Text, MessageBoxButtons.YesNo, MessageBoxIcon.Information) == DialogResult.Yes)
                OpenBrowser(RuntimeInstaller);
            Close();
        }
        catch (Exception error)
        {
            if (IsDisposed) return;
            MessageBox.Show(this, "Uygulama başlatılamadı.\n" + error.Message,
                Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    private void ClearPageState()
    {
        overlaySnapshot = null;
        overlay.Hide();
        pushToTalk.Configure(null);
    }

    private void ReceiveOverlay(string message)
    {
        if (message.Length > 12000) return;
        var value = json.Deserialize<OverlaySnapshot>(message);
        if (value?.People == null || value.People.Length > 12 || value.Count < value.People.Length ||
            value.Room == null || value.Room.Length > 40) return;
        foreach (var person in value.People)
            if (person?.Name == null || person.Name.Length > 40) return;
        overlaySnapshot = value;
        if (value.Count > 0) overlay.SetSnapshot(value);
        RefreshOverlay(force: true);
    }

    private void RefreshOverlay(bool force = false)
    {
        var now = Environment.TickCount;
        if (!force && unchecked(now - overlayLastUpdate) < 200) return;
        overlayLastUpdate = now;
        var foreground = GetForegroundWindow();
        if (!overlaySetting.Checked || overlaySnapshot == null || overlaySnapshot.Count == 0 ||
            foreground == IntPtr.Zero || foreground == Handle || !GetWindowRect(foreground, out var bounds))
        {
            overlay.Hide();
            return;
        }
        var screen = Screen.FromHandle(foreground).Bounds;
        overlay.ShowOn(Rectangle.FromLTRB(bounds.Left, bounds.Top, bounds.Right, bounds.Bottom), screen);
    }

    private void HandlePermission(CoreWebView2PermissionRequestedEventArgs args)
    {
        if (args.PermissionKind != CoreWebView2PermissionKind.Microphone) return;
        if (!IsSite(args.Uri))
        {
            args.State = CoreWebView2PermissionState.Deny;
            return;
        }

        args.SavesInProfile = false;
        microphoneAllowed ??= MessageBox.Show(this,
            "Ses odalarında mikrofon kullanılsın mı?", Text,
            MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes;
        args.State = microphoneAllowed.Value
            ? CoreWebView2PermissionState.Allow
            : CoreWebView2PermissionState.Deny;
    }

    private void ReadForegroundKey()
    {
        var foreground = GetForegroundWindow();
        var inBackground = foreground != IntPtr.Zero && foreground != Handle;
        if (inBackground && (GetAsyncKeyState(0x11) < 0 || GetAsyncKeyState(0x12) < 0
            || GetAsyncKeyState(0x5B) < 0 || GetAsyncKeyState(0x5C) < 0))
            inBackground = false;
        var key = pushToTalk.VirtualKey;
        var keyDown = inBackground && key != 0 && GetAsyncKeyState(key) < 0;
        pushToTalk.Sample(inBackground, keyDown);
    }

    private void PostPushToTalk(string code, bool down)
    {
        if (web == null || !IsSite(web.Source)) return;
        try
        {
            web.PostWebMessageAsJson(json.Serialize(new { kind = "desktop-ptt", code, down }));
        }
        catch (InvalidOperationException) { }
        catch (COMException) { }
    }

    private static bool IsSite(string value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
        uri.Scheme == Uri.UriSchemeHttps && uri.Host == "birartibir.online" &&
        uri.IsDefaultPort && string.IsNullOrEmpty(uri.UserInfo);

    private static void OpenBrowser(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps) return;
        try
        {
            Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
        }
        catch (System.ComponentModel.Win32Exception) { }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WindowRect
    {
        internal int Left, Top, Right, Bottom;
    }

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetWindowRect(IntPtr window, out WindowRect rectangle);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int virtualKey);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();
}
