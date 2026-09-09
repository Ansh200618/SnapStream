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
        Timeout = TimeSpan.FromMinutes(5),
        DefaultRequestHeaders = { { "User-Agent", "SnapStream-Windows-Installer/1.0" } }
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
        _browsers.Clear();

        AddBrowser("Google Chrome", "chrome://extensions", new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe")
        });

        AddBrowser("Microsoft Edge", "edge://extensions", new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Microsoft\Edge\Application\msedge.exe")
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

        if (_browsers.Count > 0)
        {
            _browsers[0].IsSelected = true;
            _selectedBrowser = _browsers[0];
        }
        else
        {
            StatusText.Text = "No supported Chromium browser was detected. Install Chrome, Edge, Brave, or Vivaldi first.";
        }
    }

    private void AddBrowser(string name, string extensionsPage, IEnumerable<string> candidates)
    {
        var path = candidates.FirstOrDefault(File.Exists);
        if (path is null) return;
        _browsers.Add(new BrowserInfo(name, path, extensionsPage));
    }

    private async Task CheckForUpdatesAsync(bool showProgress)
    {
        try
        {
            if (showProgress)
            {
                Progress.IsIndeterminate = true;
                StatusText.Text = "Checking GitHub for the latest SnapStream version…";
            }

            var json = await Http.GetStringAsync(RawManifestUrl);
            using var doc = JsonDocument.Parse(json);
            _remoteVersion = doc.RootElement.GetProperty("version").GetString() ?? "unknown";
            var localVersion = ReadLocalVersion();

            if (localVersion is null)
            {
                VersionTitle.Text = $"SnapStream {_remoteVersion} available";
                VersionDetail.Text = "Not installed on this PC yet";
                InstallButton.Content = "Install latest";
            }
            else if (CompareVersions(_remoteVersion, localVersion) > 0)
            {
                VersionTitle.Text = $"Update {_remoteVersion} available";
                VersionDetail.Text = $"Installed: {localVersion}";
                InstallButton.Content = $"Update to {_remoteVersion}";
            }
            else
            {
                VersionTitle.Text = $"SnapStream {localVersion}";
                VersionDetail.Text = "You have the latest GitHub version";
                InstallButton.Content = "Repair / reinstall latest";
            }
        }
        catch (Exception ex)
        {
            VersionTitle.Text = "Could not reach GitHub";
            VersionDetail.Text = ex.Message;
            StatusText.Text = "Check your internet connection and try again.";
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
        catch
        {
            return null;
        }
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
        try
        {
            await InstallOrUpdateAsync();
        }
        finally
        {
            InstallButton.IsEnabled = true;
            CheckButton.IsEnabled = true;
        }
    }

    private async Task InstallOrUpdateAsync()
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), $"SnapStreamSetup-{Guid.NewGuid():N}");
        var zipPath = Path.Combine(tempRoot, "SnapStream.zip");
        var extractedRoot = Path.Combine(tempRoot, "source");
        var staging = Path.Combine(AppRoot, $"Extension.staging-{Guid.NewGuid():N}");
        var backup = Path.Combine(AppRoot, $"Extension.backup-{Guid.NewGuid():N}");

        Directory.CreateDirectory(tempRoot);
        Directory.CreateDirectory(AppRoot);

        try
        {
            StatusText.Text = "Downloading the latest SnapStream build from GitHub…";
            Progress.IsIndeterminate = false;
            Progress.Value = 8;

            using (var response = await Http.GetAsync(SourceZipUrl, HttpCompletionOption.ResponseHeadersRead))
            {
                response.EnsureSuccessStatusCode();
                await using var input = await response.Content.ReadAsStreamAsync();
                await using var output = File.Create(zipPath);
                await input.CopyToAsync(output);
            }

            Progress.Value = 42;
            StatusText.Text = "Verifying and preparing extension files…";
            ZipFile.ExtractToDirectory(zipPath, extractedRoot);

            var repoRoot = Directory.GetDirectories(extractedRoot).FirstOrDefault()
                ?? throw new InvalidDataException("GitHub archive did not contain the repository folder.");
            var sourceManifest = Path.Combine(repoRoot, "manifest.json");
            if (!File.Exists(sourceManifest)) throw new InvalidDataException("manifest.json is missing from the GitHub build.");

            using (var manifestDoc = JsonDocument.Parse(await File.ReadAllTextAsync(sourceManifest)))
            {
                var manifestVersion = manifestDoc.RootElement.GetProperty("version").GetString();
                if (string.IsNullOrWhiteSpace(manifestVersion)) throw new InvalidDataException("The downloaded manifest has no version.");
                _remoteVersion = manifestVersion;
            }

            Directory.CreateDirectory(staging);
            CopyExtensionPayload(repoRoot, staging);
            if (!File.Exists(Path.Combine(staging, "manifest.json")))
                throw new InvalidDataException("Staged extension is invalid: manifest.json was not copied.");

            Progress.Value = 70;
            StatusText.Text = "Installing SnapStream into its permanent folder…";

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
            VersionDetail.Text = "Files are ready in the permanent extension folder";
            InstallButton.Content = "Repair / reinstall latest";

            Clipboard.SetText(ExtensionRoot);
            StatusText.Text = "Installed successfully. The extension folder path is copied. On first setup, enable Developer mode → Load unpacked → paste/select this SnapStream Extension folder. Future updates only replace these same files.";

            OpenExtensionsPage();
            OpenFolder();
        }
        catch (Exception ex)
        {
            if (!Directory.Exists(ExtensionRoot) && Directory.Exists(backup))
            {
                try { Directory.Move(backup, ExtensionRoot); } catch { }
            }
            StatusText.Text = $"Install failed: {ex.Message}";
            MessageBox.Show(this, ex.Message, "SnapStream Setup", MessageBoxButton.OK, MessageBoxImage.Error);
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
        var rootFiles = new[] { "manifest.json" };
        var directories = new[] { "src", "views", "stylesheets", "images", "lib" };

        foreach (var file in rootFiles)
        {
            var source = Path.Combine(repoRoot, file);
            if (File.Exists(source)) File.Copy(source, Path.Combine(destination, file), true);
        }

        foreach (var directory in directories)
        {
            var source = Path.Combine(repoRoot, directory);
            if (!Directory.Exists(source)) continue;
            CopyDirectory(source, Path.Combine(destination, directory));
        }
    }

    private static void CopyDirectory(string source, string destination)
    {
        Directory.CreateDirectory(destination);
        foreach (var file in Directory.GetFiles(source))
            File.Copy(file, Path.Combine(destination, Path.GetFileName(file)), true);
        foreach (var dir in Directory.GetDirectories(source))
            CopyDirectory(dir, Path.Combine(destination, Path.GetFileName(dir)));
    }

    private void Browser_Checked(object sender, RoutedEventArgs e)
    {
        if (sender is RadioButton { Tag: BrowserInfo browser })
        {
            foreach (var item in _browsers) item.IsSelected = item == browser;
            _selectedBrowser = browser;
        }
    }

    private async void CheckButton_Click(object sender, RoutedEventArgs e) => await CheckForUpdatesAsync(true);

    private void OpenExtensions_Click(object sender, RoutedEventArgs e) => OpenExtensionsPage();
    private void OpenFolder_Click(object sender, RoutedEventArgs e) => OpenFolder();

    private void CopyPath_Click(object sender, RoutedEventArgs e)
    {
        Clipboard.SetText(ExtensionRoot);
        StatusText.Text = "Extension folder path copied to clipboard.";
    }

    private void OpenExtensionsPage()
    {
        if (_selectedBrowser is null)
        {
            MessageBox.Show(this, "Select or install a supported browser first.", "SnapStream Setup", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = _selectedBrowser.ExePath,
                Arguments = _selectedBrowser.ExtensionsPage,
                UseShellExecute = true
            });
        }
        catch (Exception ex)
        {
            StatusText.Text = $"Could not open {_selectedBrowser.Name}: {ex.Message}";
        }
    }

    private void OpenFolder()
    {
        Directory.CreateDirectory(ExtensionRoot);
        Process.Start(new ProcessStartInfo
        {
            FileName = "explorer.exe",
            Arguments = $"\"{ExtensionRoot}\"",
            UseShellExecute = true
        });
    }
}

public sealed class BrowserInfo
{
    public BrowserInfo(string name, string exePath, string extensionsPage)
    {
        Name = name;
        ExePath = exePath;
        ExtensionsPage = extensionsPage;
    }

    public string Name { get; }
    public string ExePath { get; }
    public string ExtensionsPage { get; }
    public bool IsSelected { get; set; }
}
