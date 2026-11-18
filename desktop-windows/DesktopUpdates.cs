using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace BirArtiBir.Desktop;

public sealed class DesktopRelease
{
    public string Version { get; set; } = "";
    public string Sha256 { get; set; } = "";
}

internal static class DesktopUpdates
{
    private static readonly Uri Feed = new("https://birartibir.online/desktop-update/");
    private static readonly HttpClient Http = new(new HttpClientHandler { AllowAutoRedirect = false })
    {
        Timeout = TimeSpan.FromSeconds(25)
    };
    private const int MaxBytes = 20 * 1024 * 1024;

    internal static Version Installed
    {
        get
        {
            var version = Assembly.GetExecutingAssembly().GetName().Version!;
            return new Version(version.Major, version.Minor, version.Build);
        }
    }

    internal static string InstallerName(DesktopRelease release) =>
        $"BirArtiBir-Setup-Windows-x64-v{release.Version}.exe";

    internal static DesktopRelease? ReadRelease(string metadata, Version installed)
    {
        var release = new JavaScriptSerializer().Deserialize<DesktopRelease>(metadata);
        if (release == null || !Version.TryParse(release.Version, out var version) ||
            version.Build < 0 || version.Revision != -1 || release.Version != version.ToString() ||
            !Regex.IsMatch(release.Sha256 ?? "", @"\A[0-9A-Fa-f]{64}\z"))
            throw new InvalidDataException("Güncelleme bilgisi geçersiz.");
        return version > installed ? release : null;
    }

    internal static async Task<DesktopRelease?> CheckAsync()
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(Feed, "latest.json"));
        request.Headers.CacheControl = new CacheControlHeaderValue { NoCache = true };
        using var response = await Http.SendAsync(request);
        response.EnsureSuccessStatusCode();
        return ReadRelease(await response.Content.ReadAsStringAsync(), Installed);
    }

    internal static async Task<string> DownloadAsync(DesktopRelease release)
    {
        var name = InstallerName(release);
        using var response = await Http.GetAsync(new Uri(Feed, name), HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();
        if (response.Content.Headers.ContentLength > MaxBytes)
            throw new InvalidDataException("Kurulum dosyası çok büyük.");

        var folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "BirArtiBir", "Updates");
        Directory.CreateDirectory(folder);
        var path = Path.Combine(folder, name);
        var temporary = Path.Combine(folder, Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            using var timeout = new System.Threading.CancellationTokenSource(TimeSpan.FromMinutes(2));
            using var source = await response.Content.ReadAsStreamAsync();
            using (var destination = File.Open(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                var buffer = new byte[65536];
                var total = 0;
                int count;
                while ((count = await source.ReadAsync(buffer, 0, buffer.Length, timeout.Token)) != 0)
                {
                    total += count;
                    if (total > MaxBytes) throw new InvalidDataException("Kurulum dosyası çok büyük.");
                    await destination.WriteAsync(buffer, 0, count, timeout.Token);
                }
            }

            if (!MatchesInstaller(temporary, release.Sha256))
                throw new InvalidDataException("Kurulum dosyası doğrulanamadı.");
            if (File.Exists(path)) File.Replace(temporary, path, null);
            else File.Move(temporary, path);
            return path;
        }
        finally
        {
            if (File.Exists(temporary)) File.Delete(temporary);
        }
    }

    internal static bool MatchesInstaller(string path, string expected)
    {
        using var file = File.OpenRead(path);
        if (file.ReadByte() != 'M' || file.ReadByte() != 'Z') return false;
        file.Position = 0;
        using var hash = SHA256.Create();
        var actual = BitConverter.ToString(hash.ComputeHash(file)).Replace("-", "");
        return string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase);
    }
}
