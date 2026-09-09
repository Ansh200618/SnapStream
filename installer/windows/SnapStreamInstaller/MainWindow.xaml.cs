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
        DefaultRequestHeaders = { { "User-Agent", "SnapStream-Windows-Manager/2.3" } }
    };

    private static readonly string AppRoot = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SnapStream");
    private static readonly string ExtensionRoot = Path.Combine(AppRoot, "Extension");

    private readonly ObservableCollection<BrowserInfo> _browsers = new();
    private BrowserInfo? _selectedBrowser;
    private string? _remoteVersion;
    private Func<Task>? _dialogPrimaryAction;

    public MainWindow()
    {
        InitializeComponent();
        InstallPathText.Text = ExtensionRoot;
        BrowserList.ItemsSource = _browsers;
        Loaded += async (_, _) => await InitializeAsync();
    }

    private async Task InitializeAsync()
    {
        UpdateVersionCards(null, null);
        DetectBrowsers();
        await CheckForUpdatesAsync(showDialog: false);
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
            SelectedBrowserText.Text = choose.Name;
        }
        else
        {
            _selectedBrowser = null;
            BrowserSummary.Text = "No supported Chromium browser detected";
            SelectedBrowserText.Text = "Not found";
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

    private async Task CheckForUpdatesAsync(bool showDialog)
    {
        try
        {
            TopStatus.Text = "Checking GitHub...";
            if (showDialog)
            {
                Progress.IsIndeterminate = true;
                StatusText.Text = "Checking GitHub for the latest SnapStream extension version...";
            }

            var json = await Http.GetStringAsync(RawManifestUrl);
            using var doc = JsonDocument.Parse(json);
            _remoteVersion = doc.RootElement.GetProperty("version").GetString() ?? "unknown";
            var localVersion = ReadLocalVersion();
            UpdateVersionCards(localVersion, _remoteVersion);

            if (localVersion is null)
            {
                VersionTitle.Text = $"SnapStream {_remoteVersion} is available";
                VersionDetail.Text = "The extension files are not installed on this PC yet.";
                SetInstallButtonsContent($"Install SnapStream {_remoteVersion}");
                TopStatus.Text = "Ready to install";
                SideVersionText.Text = "Not installed";
                SideVersionDetail.Text = $"Latest available: {_remoteVersion}";
                if (showDialog)
                {
                    ShowDialogCard(
                        "Installation needed",
                        $"SnapStream {_remoteVersion} is ready to install",
                        "This PC does not have the SnapStream extension files yet. Press Install to download the latest GitHub build into the permanent extension folder.",
                        "Install latest",
                        RunInstallFromUiAsync,
                        "Later");
                }
            }
            else if (CompareVersions(_remoteVersion, localVersion) > 0)
            {
                VersionTitle.Text = $"Update {_remoteVersion} available";
                VersionDetail.Text = $"Installed extension: {localVersion}. Latest GitHub version: {_remoteVersion}.";
                SetInstallButtonsContent($"Update to {_remoteVersion}");
                TopStatus.Text = "Update available";
                SideVersionText.Text = $"v{localVersion}";
                SideVersionDetail.Text = $"Update available: v{_remoteVersion}";
                if (showDialog)
                {
                    ShowDialogCard(
                        "Update available",
                        $"SnapStream {_remoteVersion} is available",
                        $"You are currently using SnapStream {localVersion}. The latest GitHub build is {_remoteVersion}.",
                        $"Update to {_remoteVersion}",
                        RunInstallFromUiAsync,
                        "Not now");
                }
            }
            else
            {
                VersionTitle.Text = $"SnapStream {localVersion} is fully up to date";
                VersionDetail.Text = "Your permanent extension folder matches the latest GitHub version.";
                SetInstallButtonsContent("Repair / reinstall latest");
                TopStatus.Text = "Up to date";
                SideVersionText.Text = $"v{localVersion}";
                SideVersionDetail.Text = "Latest GitHub build installed";
                StatusText.Text = showDialog ? "You are fully up to date." : StatusText.Text;
                if (showDialog)
                {
                    ShowDialogCard(
                        "Up to date",
                        "You are on the latest SnapStream version",
                        $"Installed extension: {localVersion}\nGitHub latest: {_remoteVersion}\n\nNo update is required. Use Repair / reinstall latest only if files are missing or Chrome shows the extension as broken.",
                        "Done",
                        null,
                        null);
                }
            }
        }
        catch (Exception ex)
        {
            VersionTitle.Text = "Could not reach GitHub";
            VersionDetail.Text = ex.Message;
            TopStatus.Text = "Offline";
            StatusText.Text = "Check your internet connection and press Check now.";
            RemoteVersionText.Text = "Offline";
            if (showDialog)
            {
                ShowDialogCard(
                    "Connection failed",
                    "SnapStream could not check GitHub",
                    $"The update check failed:\n{ex.Message}\n\nCheck your internet connection and try again.",
                    "OK",
                    null,
                    null);
            }
        }
        finally
        {
            if (showDialog)
            {
                Progress.IsIndeterminate = false;
                Progress.Value = 0;
            }
        }
    }

    private void UpdateVersionCards(string? localVersion, string? remoteVersion)
    {
        LocalVersionText.Text = string.IsNullOrWhiteSpace(localVersion) ? "Not installed" : $"v{localVersion}";
        RemoteVersionText.Text = string.IsNullOrWhiteSpace(remoteVersion) ? "Checking" : $"v{remoteVersion}";
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

    private async void InstallButton_Click(object sender, RoutedEventArgs e) => await RunInstallFromUiAsync();

    private async Task RunInstallFromUiAsync()
    {
        SetMainButtonsEnabled(false);
        try
        {
            await InstallOrUpdateAsync();
        }
        finally
        {
            SetMainButtonsEnabled(true);
        }
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
            DialogOverlay.Visibility = Visibility.Collapsed;
            StatusText.Text = "Downloading the latest SnapStream extension from GitHub...";
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
            StatusText.Text = "Validating downloaded files and manifest...";
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
            StatusText.Text = "Writing the permanent SnapStream extension folder...";
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

            Clipboard.SetText(ExtensionRoot);
            Progress.Value = 100;
            var installed = ReadLocalVersion() ?? _remoteVersion ?? "latest";
            UpdateVersionCards(installed, _remoteVersion);
            VersionTitle.Text = $"SnapStream {installed} is installed";
            VersionDetail.Text = "Extension files are ready. If this is the first time on this browser, open the activation guide once.";
            SetInstallButtonsContent("Repair / reinstall latest");
            TopStatus.Text = "Installed";
            SideVersionText.Text = $"v{installed}";
            SideVersionDetail.Text = "Installed in the permanent folder";
            StatusText.Text = "Extension files installed successfully. The extension folder path was copied to clipboard.";

            ShowDialogCard(
                "Install complete",
                $"SnapStream {installed} is ready",
                "The latest extension files are now installed in the permanent SnapStream folder. For first-time browser activation, open the in-app guide next. Future updates will reuse this same folder.",
                "Open activation guide",
                () =>
                {
                    ShowActivationGuide();
                    return Task.CompletedTask;
                },
                "Done");
        }
        catch (Exception ex)
        {
            if (!Directory.Exists(ExtensionRoot) && Directory.Exists(backup))
            {
                try { Directory.Move(backup, ExtensionRoot); } catch { }
            }
            TopStatus.Text = "Install failed";
            StatusText.Text = $"Install failed: {ex.Message}";
            ShowDialogCard(
                "Install failed",
                "SnapStream could not finish installation",
                ex.Message,
                "OK",
                null,
                null);
        }
        finally
        {
            Progress.IsIndeterminate = false;
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
            SelectedBrowserText.Text = browser.Name;
        }
    }

    private async void CheckButton_Click(object sender, RoutedEventArgs e) => await CheckForUpdatesAsync(showDialog: true);

    private void RescanBrowsers_Click(object sender, RoutedEventArgs e)
    {
        DetectBrowsers();
        ShowDialogCard(
            "Browser scan complete",
            _selectedBrowser is null ? "No supported browser found" : $"{_selectedBrowser.Name} is selected",
            _selectedBrowser is null
                ? "Install Chrome, Edge, Brave, Vivaldi, Opera, or Opera GX, then press Rescan again."
                : $"SnapStream detected {_browsers.Count} supported browser{(_browsers.Count == 1 ? "" : "s")} on this PC.",
            "OK",
            null,
            null);
    }

    private void OpenExtensions_Click(object sender, RoutedEventArgs e) => OpenExtensionsPage(promptBeforeGeneric: true);
    private void OpenFolder_Click(object sender, RoutedEventArgs e) => OpenFolder();
    private void GuidedSetup_Click(object sender, RoutedEventArgs e) => ShowActivationGuide();

    private void ShowActivationGuide()
    {
        if (!Directory.Exists(ExtensionRoot) || !File.Exists(Path.Combine(ExtensionRoot, "manifest.json")))
        {
            ShowDialogCard(
                "Install first",
                "Install SnapStream files before browser activation",
                "The extension folder is not ready yet. Install the latest extension files first, then open the activation guide.",
                "Install latest",
                RunInstallFromUiAsync,
                "Cancel");
            return;
        }

        if (_selectedBrowser is null)
        {
            ShowDialogCard(
                "Browser required",
                "Select a supported Chromium browser",
                "SnapStream could not find Chrome, Edge, Brave, Vivaldi, Opera, or Opera GX on this PC. Install one of them or press Rescan after installation.",
                "OK",
                null,
                null);
            return;
        }

        Clipboard.SetText(ExtensionRoot);
        ActivationBrowserName.Text = $"Selected browser: {_selectedBrowser.Name}";
        ActivationPathText.Text = ExtensionRoot;
        ActivationOverlay.Visibility = Visibility.Visible;
        StatusText.Text = "Activation guide is open. Read the steps first; the browser will open only after pressing the final button.";
        Activate();
    }

    private void LaunchActivationBrowser_Click(object sender, RoutedEventArgs e)
    {
        Clipboard.SetText(ExtensionRoot);
        OpenExtensionsPage(promptBeforeGeneric: false);
        StatusText.Text = $"{_selectedBrowser?.Name ?? "Browser"} extension setup page opened. The SnapStream folder path is still copied to clipboard.";
    }

    private void ActivationClose_Click(object sender, RoutedEventArgs e)
    {
        ActivationOverlay.Visibility = Visibility.Collapsed;
    }

    private void CopyPath_Click(object sender, RoutedEventArgs e)
    {
        Clipboard.SetText(ExtensionRoot);
        StatusText.Text = "SnapStream extension folder copied to clipboard.";
        if (ActivationOverlay.Visibility == Visibility.Visible) ActivationPathText.Text = ExtensionRoot;
    }

    private void OpenExtensionsPage(bool promptBeforeGeneric = false)
    {
        if (_selectedBrowser is null)
        {
            ShowDialogCard(
                "Browser required",
                "Select a browser first",
                "SnapStream needs a detected Chromium browser before it can open the extensions page.",
                "OK",
                null,
                null);
            return;
        }

        var exactUrl = FindSnapStreamExtensionDetailsUrl(_selectedBrowser);
        if (!string.IsNullOrWhiteSpace(exactUrl))
        {
            LaunchBrowserUrl(exactUrl, exact: true);
            return;
        }

        if (promptBeforeGeneric)
        {
            ShowDialogCard(
                "Browser setup needed",
                "SnapStream is not activated in this browser yet",
                $"I could not find SnapStream inside {_selectedBrowser.Name}'s installed extension profile. The app will open the Extensions page next. Then turn on Developer mode, click Load unpacked, and select the copied folder:\n\n{ExtensionRoot}",
                "Open extensions page",
                () =>
                {
                    Clipboard.SetText(ExtensionRoot);
                    LaunchBrowserUrl(_selectedBrowser.ExtensionsPage, exact: false);
                    return Task.CompletedTask;
                },
                "Cancel");
            return;
        }

        LaunchBrowserUrl(_selectedBrowser.ExtensionsPage, exact: false);
    }

    private void LaunchBrowserUrl(string url, bool exact)
    {
        if (_selectedBrowser is null) return;

        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = _selectedBrowser.ExePath,
                Arguments = $"--new-window \"{url}\"",
                UseShellExecute = true
            });

            StatusText.Text = exact
                ? $"Opened the exact SnapStream extension details page in {_selectedBrowser.Name}."
                : $"Opened {_selectedBrowser.Name} extensions page. The SnapStream folder path is copied when using the activation guide.";
        }
        catch
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = _selectedBrowser.ExePath,
                    Arguments = $"\"{url}\"",
                    UseShellExecute = true
                });

                StatusText.Text = exact
                    ? $"Opened the SnapStream extension page in {_selectedBrowser.Name}."
                    : $"Opened {_selectedBrowser.Name} extensions page.";
            }
            catch (Exception ex)
            {
                StatusText.Text = $"Could not open {_selectedBrowser.Name}: {ex.Message}";
                ShowDialogCard("Could not open browser", $"Could not open {_selectedBrowser.Name}", ex.Message, "OK", null, null);
            }
        }
    }

    private string? FindSnapStreamExtensionDetailsUrl(BrowserInfo browser)
    {
        var extensionId = FindSnapStreamExtensionId(browser);
        if (string.IsNullOrWhiteSpace(extensionId)) return null;

        var scheme = browser.ExtensionsPage.Split(new[] { "://" }, StringSplitOptions.None)[0];
        if (string.IsNullOrWhiteSpace(scheme)) return null;
        return $"{scheme}://extensions/?id={extensionId}";
    }

    private string? FindSnapStreamExtensionId(BrowserInfo browser)
    {
        foreach (var preferencesPath in EnumeratePreferenceFiles(browser))
        {
            try
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(preferencesPath));
                if (!doc.RootElement.TryGetProperty("extensions", out var extensions)) continue;
                if (!extensions.TryGetProperty("settings", out var settings)) continue;

                foreach (var extension in settings.EnumerateObject())
                {
                    var value = extension.Value;
                    if (LooksLikeSnapStreamExtension(value)) return extension.Name;
                }
            }
            catch
            {
                // Ignore locked or partially-written Preferences files and keep scanning other profiles.
            }
        }

        return null;
    }

    private static bool LooksLikeSnapStreamExtension(JsonElement settings)
    {
        if (settings.TryGetProperty("path", out var pathElement))
        {
            var path = pathElement.GetString();
            if (PathLooksLikeExtensionRoot(path)) return true;
        }

        if (settings.TryGetProperty("manifest", out var manifest))
        {
            if (manifest.TryGetProperty("name", out var nameElement) && IsSnapStreamText(nameElement.GetString())) return true;
            if (manifest.TryGetProperty("description", out var descriptionElement) && IsSnapStreamText(descriptionElement.GetString())) return true;
        }

        return false;
    }

    private static bool IsSnapStreamText(string? value)
    {
        return !string.IsNullOrWhiteSpace(value) && value.Contains("SnapStream", StringComparison.OrdinalIgnoreCase);
    }

    private static bool PathLooksLikeExtensionRoot(string? candidate)
    {
        if (string.IsNullOrWhiteSpace(candidate)) return false;

        try
        {
            var normalizedCandidate = NormalizePath(candidate);
            var normalizedExtension = NormalizePath(ExtensionRoot);
            return string.Equals(normalizedCandidate, normalizedExtension, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private static string NormalizePath(string value)
    {
        return Path.GetFullPath(Environment.ExpandEnvironmentVariables(value.Trim().Trim('"')))
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
    }

    private static IEnumerable<string> EnumeratePreferenceFiles(BrowserInfo browser)
    {
        foreach (var root in CandidateProfileRoots(browser))
        {
            if (string.IsNullOrWhiteSpace(root)) continue;

            var directPreferences = Path.Combine(root, "Preferences");
            if (File.Exists(directPreferences)) yield return directPreferences;

            if (!Directory.Exists(root)) continue;

            IEnumerable<string> profileDirs;
            try
            {
                profileDirs = Directory.EnumerateDirectories(root)
                    .Where(path =>
                    {
                        var name = Path.GetFileName(path);
                        return name.Equals("Default", StringComparison.OrdinalIgnoreCase)
                               || name.Equals("Guest Profile", StringComparison.OrdinalIgnoreCase)
                               || name.StartsWith("Profile ", StringComparison.OrdinalIgnoreCase);
                    })
                    .ToList();
            }
            catch
            {
                continue;
            }

            foreach (var profileDir in profileDirs)
            {
                var preferences = Path.Combine(profileDir, "Preferences");
                if (File.Exists(preferences)) yield return preferences;
            }
        }
    }

    private static IEnumerable<string> CandidateProfileRoots(BrowserInfo browser)
    {
        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var roaming = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        var name = browser.Name;

        if (name.Contains("Chrome Canary", StringComparison.OrdinalIgnoreCase)) yield return Path.Combine(local, @"Google\Chrome SxS\User Data");
        else if (name.Contains("Chrome Beta", StringComparison.OrdinalIgnoreCase)) yield return Path.Combine(local, @"Google\Chrome Beta\User Data");
        else if (name.Contains("Chrome", StringComparison.OrdinalIgnoreCase)) yield return Path.Combine(local, @"Google\Chrome\User Data");
        else if (name.Contains("Edge Beta", StringComparison.OrdinalIgnoreCase)) yield return Path.Combine(local, @"Microsoft\Edge Beta\User Data");
        else if (name.Contains("Edge", StringComparison.OrdinalIgnoreCase)) yield return Path.Combine(local, @"Microsoft\Edge\User Data");
        else if (name.Contains("Brave", StringComparison.OrdinalIgnoreCase)) yield return Path.Combine(local, @"BraveSoftware\Brave-Browser\User Data");
        else if (name.Contains("Vivaldi", StringComparison.OrdinalIgnoreCase)) yield return Path.Combine(local, @"Vivaldi\User Data");
        else if (name.Contains("Opera GX", StringComparison.OrdinalIgnoreCase)) yield return Path.Combine(roaming, @"Opera Software\Opera GX Stable");
        else if (name.Contains("Opera", StringComparison.OrdinalIgnoreCase)) yield return Path.Combine(roaming, @"Opera Software\Opera Stable");
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

    private void SetInstallButtonsContent(string text)
    {
        InstallButton.Content = text;
        InstallButtonSecondary.Content = text;
    }

    private void SetMainButtonsEnabled(bool enabled)
    {
        InstallButton.IsEnabled = enabled;
        InstallButtonSecondary.IsEnabled = enabled;
        CheckButton.IsEnabled = enabled;
    }

    private void ShowDialogCard(
        string kicker,
        string title,
        string body,
        string primaryText,
        Func<Task>? primaryAction,
        string? secondaryText)
    {
        _dialogPrimaryAction = primaryAction;
        DialogKicker.Text = kicker;
        DialogTitle.Text = title;
        DialogBody.Text = body;
        DialogPrimaryButton.Content = primaryText;
        DialogSecondaryButton.Content = secondaryText ?? "Close";
        DialogSecondaryButton.Visibility = string.IsNullOrWhiteSpace(secondaryText) ? Visibility.Collapsed : Visibility.Visible;
        DialogOverlay.Visibility = Visibility.Visible;
        Activate();
    }

    private async void DialogPrimaryButton_Click(object sender, RoutedEventArgs e)
    {
        var action = _dialogPrimaryAction;
        DialogOverlay.Visibility = Visibility.Collapsed;
        _dialogPrimaryAction = null;
        if (action is not null) await action();
    }

    private void DialogSecondaryButton_Click(object sender, RoutedEventArgs e)
    {
        DialogOverlay.Visibility = Visibility.Collapsed;
        _dialogPrimaryAction = null;
    }
}

public sealed class BrowserInfo
{
    public BrowserInfo(string name, string exePath, string extensionsPage, string versionText)
    {
        Name = name;
        ExePath = exePath;
        ExtensionsPage = extensionsPage;
        VersionText = versionText;
    }

    public string Name { get; }
    public string ExePath { get; }
    public string ExtensionsPage { get; }
    public string VersionText { get; }
    public bool IsSelected { get; set; }
}
