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
    private const int OverlayHotkey = 101;
    private readonly VoiceOverlay overlay = new();
    private OverlaySettings overlayAppearance = OverlaySettings.Load();
    private OverlaySnapshot? overlaySnapshot;
    private readonly ToolStripMenuItem overlaySetting = new("Oyun göstergesi") { CheckOnClick = true, ShortcutKeyDisplayString = "Ctrl+Shift+F10" };
    private int overlayLastUpdate;
    private readonly ToolStripMenuItem updateMenu = new("Güncelleme");
    private readonly ToolStripMenuItem checkUpdate = new("Güncellemeleri denetle");
    private readonly ToolStripMenuItem downloadUpdate = new("Güncellemeyi indir") { Enabled = false };
    private DesktopRelease? availableUpdate;
    private bool updateBusy;
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
        var overlayOptions = new ToolStripMenuItem("Gösterge ayarları…");
        overlayOptions.Click += (_, _) => EditOverlaySettings();
        viewMenu.DropDownItems.Add(overlayOptions);
        var resizeOverlay = new ToolStripMenuItem("Fareyle boyutlandır…");
        resizeOverlay.Click += (_, _) => ResizeOverlay();
        viewMenu.DropDownItems.Add(resizeOverlay);
        menu.Items.Add(viewMenu);
        updateMenu.DropDownItems.Add(new ToolStripMenuItem("Sürüm " + DesktopUpdates.Installed) { Enabled = false });
        updateMenu.DropDownItems.Add(checkUpdate);
        updateMenu.DropDownItems.Add(downloadUpdate);
        checkUpdate.Click += async (_, _) => await CheckForUpdateAsync(showResult: true);
        downloadUpdate.Click += async (_, _) => await DownloadUpdateAsync();
        menu.Items.Add(updateMenu);
        MainMenuStrip = menu;
        Controls.Add(webView);
        Controls.Add(menu);
        overlaySetting.Checked = overlayAppearance.Enabled;
        overlay.SetAppearance(overlayAppearance);
        overlaySetting.CheckedChanged += (_, _) =>
        {
            if (overlayAppearance.Enabled != overlaySetting.Checked)
            {
                overlayAppearance.Enabled = overlaySetting.Checked;
                overlayAppearance.Save();
            }
            RefreshOverlay(force: true);
        };
        pushToTalk = new PushToTalk(PostPushToTalk);
        keyboardTimer.Tick += (_, _) =>
        {
            ReadForegroundKey();
            RefreshOverlay();
        };
        Shown += async (_, _) =>
        {
            _ = CheckForUpdateAsync(showResult: false);
            await InitializeSiteAsync();
        };
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

    private void SetUpdateBusy(bool busy)
    {
        updateBusy = busy;
        checkUpdate.Enabled = !busy;
        downloadUpdate.Enabled = !busy && availableUpdate != null;
    }

    private async System.Threading.Tasks.Task CheckForUpdateAsync(bool showResult)
    {
        if (updateBusy) return;
        SetUpdateBusy(true);
        try
        {
            var release = await DesktopUpdates.CheckAsync();
            if (IsDisposed) return;
            availableUpdate = release;
            updateMenu.Text = release == null ? "Güncelleme" : "Güncelleme var";
            downloadUpdate.Text = release == null ? "Güncellemeyi indir" : $"v{release.Version} sürümünü indir";
            if (showResult && release == null)
                MessageBox.Show(this, "Bir Artı Bir güncel.", Text, MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
        }
        catch (Exception error)
        {
            if (showResult && !IsDisposed)
                MessageBox.Show(this, "Güncelleme denetlenemedi.\n" + error.Message, Text,
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        finally
        {
            if (!IsDisposed) SetUpdateBusy(false);
        }
    }

    private async System.Threading.Tasks.Task DownloadUpdateAsync()
    {
        if (updateBusy || availableUpdate == null) return;
        SetUpdateBusy(true);
        try
        {
            var path = await DesktopUpdates.DownloadAsync(availableUpdate);
            if (IsDisposed) return;
            if (MessageBox.Show(this, "Güncelleme indirildi. Kuruluma geçmek için uygulama kapanacak. Şimdi kurulsun mu?",
                    Text, MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
            {
                Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
                Close();
            }
            else Process.Start(new ProcessStartInfo("explorer.exe", "/select,\"" + path + "\"") { UseShellExecute = true });
        }
        catch (Exception error)
        {
            if (!IsDisposed)
                MessageBox.Show(this, "Güncelleme tamamlanamadı.\n" + error.Message, Text,
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        finally
        {
            if (!IsDisposed) SetUpdateBusy(false);
        }
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

    protected override void OnHandleCreated(EventArgs args)
    {
        base.OnHandleCreated(args);
        RegisterHotKey(Handle, OverlayHotkey, 0x4006, 0x79); // Ctrl + Shift + F10, no repeat.
    }

    protected override void OnHandleDestroyed(EventArgs args)
    {
        UnregisterHotKey(Handle, OverlayHotkey);
        base.OnHandleDestroyed(args);
    }

    protected override void WndProc(ref Message message)
    {
        if (message.Msg == 0x0312 && message.WParam.ToInt32() == OverlayHotkey)
        {
            overlaySetting.Checked = !overlaySetting.Checked;
            return;
        }
        base.WndProc(ref message);
    }

    private void EditOverlaySettings()
    {
        using var dialog = new OverlaySettingsDialog(overlayAppearance);
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        overlayAppearance = dialog.Result;
        SaveOverlayAppearance();
    }

    private void ResizeOverlay()
    {
        using var dialog = new OverlayResizeDialog(overlayAppearance,
            overlaySnapshot?.Count > 0 ? overlaySnapshot : OverlaySettingsDialog.PreviewRoom);
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        overlayAppearance.Width = dialog.PanelSize.Width;
        overlayAppearance.Height = dialog.PanelSize.Height;
        overlayAppearance.Rows = 12;
        overlayAppearance.Clamp();
        SaveOverlayAppearance();
    }

    private void SaveOverlayAppearance()
    {
        overlay.SetAppearance(overlayAppearance);
        overlaySetting.Checked = overlayAppearance.Enabled;
        if (!overlayAppearance.Save())
            MessageBox.Show(this, "Gösterge ayarları kaydedilemedi.", Text, MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        RefreshOverlay(force: true);
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
            foreground == IntPtr.Zero || foreground == Handle || !Enabled || !GetWindowRect(foreground, out var bounds))
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
    private static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint key);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnregisterHotKey(IntPtr window, int id);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetWindowRect(IntPtr window, out WindowRect rectangle);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int virtualKey);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();
}
