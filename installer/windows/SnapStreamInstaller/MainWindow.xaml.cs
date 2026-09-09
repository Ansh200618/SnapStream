using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;

namespace SnapStreamInstaller;

public partial class MainWindow : Window
{
    private const string RawManifestUrl = "https://raw.githubusercontent.com/anshdeepofficial/SnapStream/main/manifest.json";
    private const string SourceZipUrl = "https://codeload.github.com/anshdeepofficial/SnapStream/zip/refs/heads/main";

    private static readonly HttpClient Http = new()
    {
        Timeout = TimeSpan.FromMinutes(8),
        DefaultRequestHeaders = { { "User-Agent", "SnapStream-Windows-Manager/2.0" } }
    };

    private static readonly string AppRoot = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SnapStream");
    private static readonly string ExtensionRoot = Path.Combine(AppRoot, "Extension");

    private readonly ObservableCollection<BrowserInfo> _browsers = new();
    private BrowserInfo? _selectedBrowser;
    private string? _remoteVersion;

    public MainWindow()
    {
        InitializeComponent();
        InstallPathText.Text = ExtensionRoot;
        BrowserList.ItemsSource = _browsers;
        Loaded += async (_, _) => await InitializeAsync();
    }

    private async Task InitializeAsync()
    {
        DetectBrowsers();
        await CheckForUpdatesAsync(false);
    }

    private void DetectBrowsers()
    {
        var preferred = _selectedBrowser?.Name;
        _browsers.Clear();

        AddBrowser("Google Chrome", "chrome://extensions", new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe")
        });
        AddBrowser("Google Chrome Beta", "chrome://extensions", new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome Beta\Application\chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome Beta\Application\chrome.exe")
        });
        AddBrowser("Google Chrome Canary", "chrome://extensions", new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome SxS\Application\chrome.exe")
        });
        AddBrowser("Microsoft Edge", "edge://extensions", new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Microsoft\Edge\Application\msedge.exe")
        });
        AddBrowser("Microsoft Edge Beta", "edge://extensions", new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge Beta\Application\msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Microsoft\Edge Beta\Application\msedge.exe")
        });
        AddBrowser("Brave", "brave://extensions", new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"BraveSoftware\Brave-Browser\Application\brave.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"BraveSoftware\Brave-Browser\Application\brave.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"BraveSoftware\Brave-Browser\Application\brave.exe")
        });
        AddBrowser("Vivaldi", "vivaldi://extensions", new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Vivaldi\Application\vivaldi.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Vivaldi\Application\vivaldi.exe")
        });
        AddBrowser("Opera", "opera://extensions", new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\Opera\opera.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\Opera Stable\opera.exe")
        });
        AddBrowser("Opera GX", "opera://extensions", new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\Opera GX\opera.exe")
        });

        BrowserInfo? choose = null;
        if (!string.IsNullOrWhiteSpace(preferred)) choose = _browsers.FirstOrDefault(x => x.Name == preferred);
        choose ??= _browsers.FirstOrDefault(x => x.Name == "Google Chrome")
               ?? _browsers.FirstOrDefault(x => x.Name == "Microsoft Edge")
               ?? _browsers.FirstOrDefault();

        if (choose is not null)
        {
            choose.IsSelected = true;
            _selectedBrowser = choose;
            BrowserSummary.Text = $"{_browsers.Count} supported Chromium browser{(_browsers.Count == 1 ? "" : "s")} detected · {choose.Name} selected";
        }
        else
        {
            _selectedBrowser = null;
            BrowserSummary.Text = "No supported Chromium browser detected";
            StatusText.Text = "Install Chrome, Edge, Brave, Vivaldi, Opera, or Opera GX, then press Rescan.";
        }
    }

    private void AddBrowser(string name, string extensionsPage, IEnumerable<string> candidates)
    {
        var path = candidates.FirstOrDefault(File.Exists);
        if (path is null || _browsers.Any(x => string.Equals(x.ExePath, path, StringComparison.OrdinalIgnoreCase))) return;
        var version = "Version unknown";
        try
        {
            var info = FileVersionInfo.GetVersionInfo(path);
            if (!string.IsNullOrWhiteSpace(info.FileVersion)) version = $"Version {info.FileVersion}";
        }
        catch { }
        _browsers.Add(new BrowserInfo(name, path, extensionsPage, version));
    }

    private async Task CheckForUpdatesAsync(bool showProgress)
    {
        try
        {
            TopStatus.Text = "Checking GitHub…";
            if (showProgress)
            {
                Progress.IsIndeterminate = true;
                StatusText.Text = "Checking GitHub for the latest SnapStream extension version…";
            }

            var json = await Http.GetStringAsync(RawManifestUrl);
            using var doc = JsonDocument.Parse(json);
            _remoteVersion = doc.RootElement.GetProperty("version").GetString() ?? "unknown";
            var localVersion = ReadLocalVersion();

            if (localVersion is null)
            {
                VersionTitle.Text = $"SnapStream {_remoteVersion} available";
                VersionDetail.Text = "Extension files are not installed on this PC yet";
                InstallButton.Content = "Install latest extension";
                TopStatus.Text = "Ready to install";
            }
            else if (CompareVersions(_remoteVersion, localVersion) > 0)
            {
                VersionTitle.Text = $"Update {_remoteVersion} available";
                VersionDetail.Text = $"Installed extension: {localVersion}";
                InstallButton.Content = $"Update to {_remoteVersion}";
                TopStatus.Text = "Update available";
            }
            else
            {
                VersionTitle.Text = $"SnapStream {localVersion} is current";
                VersionDetail.Text = "Your permanent extension folder matches the latest GitHub version";
                InstallButton.Content = "Repair / reinstall latest";
                TopStatus.Text = "Up to date";
            }
        }
        catch (Exception ex)
        {
            VersionTitle.Text = "Could not reach GitHub";
            VersionDetail.Text = ex.Message;
            TopStatus.Text = "Offline";
            StatusText.Text = "Check your internet connection and press Check now.";
        }
        finally
        {
            if (showProgress)
            {
                Progress.IsIndeterminate = false;
                Progress.Value = 0;
            }
        }
    }

    private string? ReadLocalVersion()
    {
        var manifest = Path.Combine(ExtensionRoot, "manifest.json");
        if (!File.Exists(manifest)) return null;
        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(manifest));
            return doc.RootElement.GetProperty("version").GetString();
        }
        catch { return null; }
    }

    private static int CompareVersions(string? left, string? right)
    {
        if (Version.TryParse(left, out var l) && Version.TryParse(right, out var r)) return l.CompareTo(r);
        return string.Compare(left, right, StringComparison.OrdinalIgnoreCase);
    }

    private async void InstallButton_Click(object sender, RoutedEventArgs e)
    {
        InstallButton.IsEnabled = false;
        CheckButton.IsEnabled = false;
        try { await InstallOrUpdateAsync(); }
        finally { InstallButton.IsEnabled = true; CheckButton.IsEnabled = true; }
    }

    private async Task InstallOrUpdateAsync()
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), $"SnapStream-{Guid.NewGuid():N}");
        var zipPath = Path.Combine(tempRoot, "SnapStream.zip");
        var extractedRoot = Path.Combine(tempRoot, "source");
        var staging = Path.Combine(AppRoot, $"Extension.staging-{Guid.NewGuid():N}");
        var backup = Path.Combine(AppRoot, $"Extension.backup-{Guid.NewGuid():N}");

        Directory.CreateDirectory(tempRoot);
        Directory.CreateDirectory(AppRoot);

        try
        {
            StatusText.Text = "Downloading the latest SnapStream extension from GitHub…";
            TopStatus.Text = "Downloading";
            Progress.IsIndeterminate = false;
            Progress.Value = 8;

            using (var response = await Http.GetAsync(SourceZipUrl, HttpCompletionOption.ResponseHeadersRead))
            {
                response.EnsureSuccessStatusCode();
                await using var input = await response.Content.ReadAsStreamAsync();
                await using var output = File.Create(zipPath);
                await input.CopyToAsync(output);
            }

            Progress.Value = 40;
            StatusText.Text = "Validating downloaded files and manifest…";
            ZipFile.ExtractToDirectory(zipPath, extractedRoot);
            var repoRoot = Directory.GetDirectories(extractedRoot).FirstOrDefault()
                ?? throw new InvalidDataException("GitHub archive did not contain the repository folder.");
            var sourceManifest = Path.Combine(repoRoot, "manifest.json");
            if (!File.Exists(sourceManifest)) throw new InvalidDataException("manifest.json is missing from the downloaded build.");

            using (var manifestDoc = JsonDocument.Parse(await File.ReadAllTextAsync(sourceManifest)))
            {
                var manifestVersion = manifestDoc.RootElement.GetProperty("version").GetString();
                if (string.IsNullOrWhiteSpace(manifestVersion)) throw new InvalidDataException("Downloaded manifest has no version.");
                _remoteVersion = manifestVersion;
            }

            Directory.CreateDirectory(staging);
            CopyExtensionPayload(repoRoot, staging);
            if (!File.Exists(Path.Combine(staging, "manifest.json"))) throw new InvalidDataException("Staged extension is invalid.");

            Progress.Value = 72;
            StatusText.Text = "Writing the permanent SnapStream extension folder…";
            if (Directory.Exists(ExtensionRoot)) Directory.Move(ExtensionRoot, backup);
            Directory.Move(staging, ExtensionRoot);
            if (Directory.Exists(backup)) Directory.Delete(backup, true);

            await File.WriteAllTextAsync(Path.Combine(AppRoot, "install-info.json"), JsonSerializer.Serialize(new
            {
                installedVersion = _remoteVersion,
                installedAtUtc = DateTime.UtcNow,
                source = "https://github.com/anshdeepofficial/SnapStream",
                extensionPath = ExtensionRoot
            }, new JsonSerializerOptions { WriteIndented = true }));

            Progress.Value = 100;
            VersionTitle.Text = $"SnapStream {_remoteVersion} installed";
            VersionDetail.Text = "Extension files are ready and future updates will replace this same folder";
            InstallButton.Content = "Repair / reinstall latest";
            TopStatus.Text = "Installed";
            Clipboard.SetText(ExtensionRoot);
            StatusText.Text = "Extension files installed successfully. The folder path is copied. If this is the first browser setup, use the purple ‘Open browser setup’ button and complete the three clearly shown browser steps once.";
        }
        catch (Exception ex)
        {
            if (!Directory.Exists(ExtensionRoot) && Directory.Exists(backup))
            {
                try { Directory.Move(backup, ExtensionRoot); } catch { }
            }
            TopStatus.Text = "Install failed";
            StatusText.Text = $"Install failed: {ex.Message}";
            MessageBox.Show(this, ex.Message, "SnapStream", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            try { if (Directory.Exists(staging)) Directory.Delete(staging, true); } catch { }
            try { if (Directory.Exists(backup)) Directory.Delete(backup, true); } catch { }
            try { if (Directory.Exists(tempRoot)) Directory.Delete(tempRoot, true); } catch { }
        }
    }

    private static void CopyExtensionPayload(string repoRoot, string destination)
    {
        foreach (var file in new[] { "manifest.json" })
        {
            var source = Path.Combine(repoRoot, file);
            if (File.Exists(source)) File.Copy(source, Path.Combine(destination, file), true);
        }
        foreach (var directory in new[] { "src", "views", "stylesheets", "images", "lib" })
        {
            var source = Path.Combine(repoRoot, directory);
            if (Directory.Exists(source)) CopyDirectory(source, Path.Combine(destination, directory));
        }
    }

    private static void CopyDirectory(string source, string destination)
    {
        Directory.CreateDirectory(destination);
        foreach (var file in Directory.GetFiles(source)) File.Copy(file, Path.Combine(destination, Path.GetFileName(file)), true);
        foreach (var dir in Directory.GetDirectories(source)) CopyDirectory(dir, Path.Combine(destination, Path.GetFileName(dir)));
    }

    private void Browser_Checked(object sender, RoutedEventArgs e)
    {
        if (sender is RadioButton { Tag: BrowserInfo browser })
        {
            foreach (var item in _browsers) item.IsSelected = item == browser;
            _selectedBrowser = browser;
            BrowserSummary.Text = $"{_browsers.Count} browser{(_browsers.Count == 1 ? "" : "s")} detected · {browser.Name} selected";
        }
    }

    private async void CheckButton_Click(object sender, RoutedEventArgs e) => await CheckForUpdatesAsync(true);
    private void RescanBrowsers_Click(object sender, RoutedEventArgs e) => DetectBrowsers();
    private void OpenExtensions_Click(object sender, RoutedEventArgs e) => OpenExtensionsPage();
    private void OpenFolder_Click(object sender, RoutedEventArgs e) => OpenFolder();

    private void GuidedSetup_Click(object sender, RoutedEventArgs e)
    {
        if (!Directory.Exists(ExtensionRoot) || !File.Exists(Path.Combine(ExtensionRoot, "manifest.json")))
        {
            MessageBox.Show(this, "Install the SnapStream extension files first. Then use Browser setup.", "SnapStream", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }
        if (_selectedBrowser is null)
        {
            MessageBox.Show(this, "Select a detected browser first.", "SnapStream", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        Clipboard.SetText(ExtensionRoot);
        OpenExtensionsPage();
        StatusText.Text = $"{_selectedBrowser.Name} extensions page opened and the SnapStream folder path was copied. In the browser: 1) enable Developer mode, 2) click Load unpacked, 3) select the copied SnapStream Extension folder. This is required only once for that browser profile.";
        MessageBox.Show(this,
            $"Finish these steps in {_selectedBrowser.Name}:\n\n1. Turn ON Developer mode.\n2. Click Load unpacked.\n3. Select this folder (already copied):\n{ExtensionRoot}\n\nChrome security requires these clicks to be made by you once. After that, SnapStream updates this same folder automatically.",
            "Finish SnapStream browser setup", MessageBoxButton.OK, MessageBoxImage.Information);
    }

    private void CopyPath_Click(object sender, RoutedEventArgs e)
    {
        Clipboard.SetText(ExtensionRoot);
        StatusText.Text = "SnapStream extension folder copied to clipboard.";
    }

    private void OpenExtensionsPage()
    {
        if (_selectedBrowser is null)
        {
            MessageBox.Show(this, "Select or install a supported Chromium browser first.", "SnapStream", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }
        try
        {
            Process.Start(new ProcessStartInfo { FileName = _selectedBrowser.ExePath, Arguments = _selectedBrowser.ExtensionsPage, UseShellExecute = true });
        }
        catch (Exception ex) { StatusText.Text = $"Could not open {_selectedBrowser.Name}: {ex.Message}"; }
    }

    private void OpenFolder()
    {
        Directory.CreateDirectory(ExtensionRoot);
        Process.Start(new ProcessStartInfo { FileName = "explorer.exe", Arguments = $"\"{ExtensionRoot}\"", UseShellExecute = true });
    }
}

public sealed class BrowserInfo
{
    public BrowserInfo(string name, string exePath, string extensionsPage, string versionText)
    {
        Name = name; ExePath = exePath; ExtensionsPage = extensionsPage; VersionText = versionText;
    }
    public string Name { get; }
    public string ExePath { get; }
    public string ExtensionsPage { get; }
    public string VersionText { get; }
    public bool IsSelected { get; set; }
}
