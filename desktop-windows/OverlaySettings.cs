using System;
using System.Drawing;
using System.IO;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace BirArtiBir.Desktop;

public sealed class OverlaySettings
{
    public bool Enabled { get; set; } = true;
    public bool Transparent { get; set; }
    internal const int MinWidth = 190, MaxWidth = 600;
    internal const int MinHeight = 90, MaxHeight = 520;
    public int Width { get; set; } = 250;
    public int Height { get; set; }
    public int TextSize { get; set; } = 100;
    public int Rows { get; set; } = 12;
    public int OffsetX { get; set; } = 12;
    public int OffsetY { get; set; } = 12;

    internal void Clamp()
    {
        Width = Limit(Width, MinWidth, MaxWidth);
        if (Height != 0) Height = Limit(Height, MinHeight, MaxHeight);
        TextSize = Limit(TextSize, 80, 150);
        Rows = Limit(Rows, 3, 12);
        OffsetX = Limit(OffsetX, 0, 250);
        OffsetY = Limit(OffsetY, 0, 250);
    }

    private static int Limit(int value, int minimum, int maximum) => Math.Max(minimum, Math.Min(maximum, value));

    private static string SettingsPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "BirArtiBir", "overlay-settings.json");

    internal static OverlaySettings Load()
    {
        try
        {
            if (File.Exists(SettingsPath))
            {
                var settings = new JavaScriptSerializer().Deserialize<OverlaySettings>(File.ReadAllText(SettingsPath));
                if (settings != null)
                {
                    settings.Clamp();
                    return settings;
                }
            }
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
        catch (ArgumentException) { }
        catch (InvalidOperationException) { }
        return new OverlaySettings();
    }

    internal bool Save()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(SettingsPath)!);
            File.WriteAllText(SettingsPath, new JavaScriptSerializer().Serialize(this));
            return true;
        }
        catch (IOException) { return false; }
        catch (UnauthorizedAccessException) { return false; }
    }
}

internal sealed class OverlaySettingsDialog : Form
{
    private readonly CheckBox enabled = new() { Text = "Oyun göstergesi açık", AutoSize = true };
    private readonly CheckBox transparent = new() { Text = "Saydam arka plan", AutoSize = true };
    private int panelWidth, panelHeight, panelRows;
    private readonly NumericUpDown textSize = Range(80, 150, 5);
    private readonly NumericUpDown offsetX = Range(0, 250, 5);
    private readonly NumericUpDown offsetY = Range(0, 250, 5);
    private readonly Panel preview = new() { Dock = DockStyle.Fill, BackColor = Color.FromArgb(66, 84, 109) };
    internal static readonly OverlaySnapshot PreviewRoom = new()
    {
        Room = "Genel",
        Count = 4,
        People = new[]
        {
            new OverlayMember { Name = "Deniz", State = "speaking" },
            new OverlayMember { Name = "Ece", State = "muted" },
            new OverlayMember { Name = "Salim", State = "open" },
            new OverlayMember { Name = "Müzik Botu", State = "music" }
        }
    };

    internal OverlaySettings Result => new()
    {
        Enabled = enabled.Checked, Transparent = transparent.Checked, Width = panelWidth, Height = panelHeight,
        TextSize = (int)textSize.Value, Rows = panelRows,
        OffsetX = (int)offsetX.Value, OffsetY = (int)offsetY.Value
    };

    internal OverlaySettingsDialog(OverlaySettings current)
    {
        Text = "Oyun göstergesi ayarları";
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        ShowInTaskbar = false;
        MinimizeBox = MaximizeBox = false;
        ClientSize = new Size(730, 320);

        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(12), ColumnCount = 2 };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 225));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        var controls = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2 };
        controls.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 65));
        controls.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 35));
        controls.Controls.Add(enabled, 0, 0);
        controls.SetColumnSpan(enabled, 2);
        controls.Controls.Add(transparent, 0, 1);
        controls.SetColumnSpan(transparent, 2);

        var resize = new Button { Text = "Fareyle boyutlandır…", AutoSize = true };
        controls.Controls.Add(resize, 0, 2);
        controls.SetColumnSpan(resize, 2);
        resize.Click += (_, _) =>
        {
            using var editor = new OverlayResizeDialog(Result, PreviewRoom);
            if (editor.ShowDialog(this) != DialogResult.OK) return;
            panelWidth = editor.PanelSize.Width;
            panelHeight = editor.PanelSize.Height;
            panelRows = 12;
            preview.Invalidate();
        };
        AddControl("Yazı boyutu (%)", textSize, 3);
        AddControl("Soldan boşluk (px)", offsetX, 5);
        AddControl("Üstten boşluk (px)", offsetY, 6);

        var reset = new Button { Text = "Varsayılanlar", AutoSize = true };
        var save = new Button { Text = "Kaydet", DialogResult = DialogResult.OK, AutoSize = true };
        var cancel = new Button { Text = "İptal", DialogResult = DialogResult.Cancel, AutoSize = true };
        controls.Controls.Add(reset, 0, 7);
        controls.SetColumnSpan(reset, 2);
        controls.Controls.Add(save, 0, 8);
        controls.Controls.Add(cancel, 1, 8);
        AcceptButton = save;
        CancelButton = cancel;
        reset.Click += (_, _) => SetControls(new OverlaySettings());
        enabled.CheckedChanged += (_, _) => preview.Invalidate();
        transparent.CheckedChanged += (_, _) => preview.Invalidate();
        foreach (var input in new[] { textSize, offsetX, offsetY })
            input.ValueChanged += (_, _) => preview.Invalidate();

        preview.Paint += (_, args) =>
        {
            TextRenderer.DrawText(args.Graphics, "Önizleme", Font, new Point(10, 7), Color.White);
            var settings = Result;
            if (!settings.Enabled) return;
            var horizontal = Math.Min(settings.OffsetX / 8, Math.Max(0, preview.Width - settings.Width - 20));
            args.Graphics.TranslateTransform(10 + horizontal, 28 + settings.OffsetY / 4);
            VoiceOverlay.PaintSnapshot(args.Graphics, PreviewRoom, settings);
        };
        layout.Controls.Add(controls, 0, 0);
        layout.Controls.Add(preview, 1, 0);
        Controls.Add(layout);
        SetControls(current);

        void AddControl(string label, NumericUpDown input, int row)
        {
            controls.Controls.Add(new Label { Text = label, Anchor = AnchorStyles.Left, AutoSize = true }, 0, row);
            controls.Controls.Add(input, 1, row);
        }
    }

    private void SetControls(OverlaySettings value)
    {
        enabled.Checked = value.Enabled;
        transparent.Checked = value.Transparent;
        panelWidth = value.Width;
        panelHeight = value.Height;
        panelRows = value.Rows;
        textSize.Value = value.TextSize;
        offsetX.Value = value.OffsetX;
        offsetY.Value = value.OffsetY;
    }

    private static NumericUpDown Range(int minimum, int maximum, int increment) => new()
    {
        Minimum = minimum, Maximum = maximum, Increment = increment, Width = 62
    };
}


internal sealed class OverlayResizeDialog : Form
{
    private readonly Panel panel = new() { Dock = DockStyle.Fill, BackColor = Color.FromArgb(66, 84, 109) };
    internal Size PanelSize => panel.ClientSize;

    internal OverlayResizeDialog(OverlaySettings current, OverlaySnapshot snapshot)
    {
        Text = "Gösterge · Kenardan veya köşeden sürükle";
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.Sizable;
        MinimizeBox = MaximizeBox = false;
        ShowInTaskbar = false;

        const int footerHeight = 38;
        var footer = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom, Height = footerHeight, FlowDirection = FlowDirection.RightToLeft,
            Padding = new Padding(3), WrapContents = false
        };
        var save = new Button { Text = "Boyutu kaydet", AutoSize = true, DialogResult = DialogResult.OK };
        var cancel = new Button { Text = "İptal", AutoSize = true, DialogResult = DialogResult.Cancel };
        footer.Controls.Add(save);
        footer.Controls.Add(cancel);
        Controls.Add(panel);
        Controls.Add(footer);
        AcceptButton = save;
        CancelButton = cancel;

        MinimumSize = SizeFromClientSize(new Size(OverlaySettings.MinWidth, OverlaySettings.MinHeight + footerHeight));
        MaximumSize = SizeFromClientSize(new Size(OverlaySettings.MaxWidth, OverlaySettings.MaxHeight + footerHeight));
        var startingSize = VoiceOverlay.PanelSize(snapshot, current);
        ClientSize = new Size(startingSize.Width, Math.Max(OverlaySettings.MinHeight, startingSize.Height) + footerHeight);
        panel.Resize += (_, _) => panel.Invalidate();
        panel.Paint += (_, args) =>
        {
            var appearance = new OverlaySettings
            {
                Width = panel.Width, Height = panel.Height, Rows = 12,
                TextSize = current.TextSize, Transparent = current.Transparent
            };
            VoiceOverlay.PaintSnapshot(args.Graphics, snapshot, appearance);
        };
    }
}
