using System;
using System.Drawing;
using System.Windows.Forms;

namespace BirArtiBir.Desktop;

public sealed class OverlaySnapshot
{
    public string Room { get; set; } = "";
    public OverlayMember[] People { get; set; } = Array.Empty<OverlayMember>();
    public int Count { get; set; }
}

public sealed class OverlayMember
{
    public string Name { get; set; } = "";
    public string State { get; set; } = "";
}

internal sealed class VoiceOverlay : Form
{
    private static readonly Color PanelColor = Color.FromArgb(18, 25, 39);
    private static readonly Color ClearColor = Color.Fuchsia;
    private OverlaySnapshot? snapshot;
    private OverlaySettings settings = new();

    internal VoiceOverlay()
    {
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        ShowInTaskbar = false;
        TopMost = true;
        Opacity = 0.99;
        BackColor = PanelColor;
        DoubleBuffered = true;
    }

    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var parameters = base.CreateParams;
            // A layered, transparent tool window lets clicks pass directly to the game.
            parameters.ExStyle |= 0x00080000 | 0x00000020 | 0x08000000 | 0x00000080;
            return parameters;
        }
    }

    protected override void WndProc(ref Message message)
    {
        if (message.Msg == 0x0084)
        {
            message.Result = new IntPtr(-1);
            return;
        }
        base.WndProc(ref message);
    }

    internal void SetAppearance(OverlaySettings value)
    {
        settings = value;
        BackColor = value.Transparent ? ClearColor : PanelColor;
        TransparencyKey = value.Transparent ? ClearColor : Color.Empty;
        if (snapshot != null) SetSnapshot(snapshot);
    }

    internal void SetSnapshot(OverlaySnapshot value)
    {
        snapshot = value;
        ClientSize = PanelSize(value, settings);
        Invalidate();
    }

    internal void ShowOn(Rectangle foreground, Rectangle screen)
    {
        var left = Math.Max(screen.Left, foreground.Left) + settings.OffsetX;
        var top = Math.Max(screen.Top, foreground.Top) + settings.OffsetY;
        var position = new Point(Math.Max(screen.Left, Math.Min(left, screen.Right - Width)),
            Math.Max(screen.Top, Math.Min(top, screen.Bottom - Height)));
        if (Location != position) Location = position;
        if (!Visible) Show();
    }

    protected override void OnPaint(PaintEventArgs args)
    {
        base.OnPaint(args);
        if (snapshot != null) PaintSnapshot(args.Graphics, snapshot, settings);
    }

    private static int RowHeight(OverlaySettings settings) => 24 * settings.TextSize / 100;
    private static int HeaderHeight(OverlaySettings settings) => 34 * settings.TextSize / 100;

    private static Size PanelSize(OverlaySnapshot value, OverlaySettings settings)
    {
        var visible = Math.Min(value.People.Length, settings.Rows);
        var footer = value.Count > visible ? RowHeight(settings) : 0;
        return new Size(settings.Width, HeaderHeight(settings) + visible * RowHeight(settings) + footer + 6);
    }

    internal static void PaintSnapshot(Graphics g, OverlaySnapshot value, OverlaySettings settings)
    {
        var panel = PanelSize(value, settings);
        var header = HeaderHeight(settings);
        var row = RowHeight(settings);
        var visible = Math.Min(value.People.Length, settings.Rows);
        var scale = settings.TextSize / 100f;
        if (!settings.Transparent)
        {
            using var background = new SolidBrush(PanelColor);
            using var line = new Pen(Color.FromArgb(52, 66, 94));
            g.FillRectangle(background, 0, 0, panel.Width, panel.Height);
            g.DrawRectangle(line, 0, 0, panel.Width - 1, panel.Height - 1);
            g.DrawLine(line, 0, header - 2, panel.Width, header - 2);
        }
        using var heading = new Font("Segoe UI", 10 * scale, FontStyle.Bold);
        using var body = new Font("Segoe UI", 9 * scale);
        using var badge = new Font("Segoe UI", 8 * scale, FontStyle.Bold);
        Draw(g, $"{value.Room} · {value.Count} kişi", heading, 11, 0, panel.Width - 22, header,
            Color.FromArgb(216, 230, 255));
        var statusWidth = Math.Min(panel.Width / 2, (int)(100 * scale));
        for (var index = 0; index < visible; index++)
        {
            var member = value.People[index];
            var y = header + index * row;
            var (status, color) = member.State switch
            {
                "speaking" => ("Konuşuyor", Color.FromArgb(119, 239, 174)),
                "muted" => ("Mikrofon kapalı", Color.FromArgb(255, 170, 174)),
                "music" => ("Müzik", Color.FromArgb(178, 195, 255)),
                _ => ("Mikrofon açık", Color.FromArgb(169, 183, 205))
            };
            using var dot = new SolidBrush(color);
            g.FillEllipse(dot, 11, y + (row - 7) / 2, 7, 7);
            Draw(g, member.Name, body, 24, y, panel.Width - statusWidth - 39, row, Color.White);
            Draw(g, status, badge, panel.Width - statusWidth - 8, y, statusWidth, row, color);
        }
        if (value.Count > visible)
            Draw(g, $"+{value.Count - visible} kişi", body, 24, header + visible * row,
                panel.Width - 35, row, Color.LightGray);
    }

    private static void Draw(Graphics g, string text, Font font, int x, int y, int width, int height, Color color)
    {
        TextRenderer.DrawText(g, text, font, new Rectangle(x, y, width, height), color,
            TextFormatFlags.EndEllipsis | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPrefix |
            TextFormatFlags.SingleLine | TextFormatFlags.NoPadding | TextFormatFlags.PreserveGraphicsTranslateTransform);
    }
}
