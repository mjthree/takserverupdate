# TAK Update Builder

A script to generate `product.inf` and `product.infz` files for ATAK update servers. These files tell ATAK clients what plugins and apps are available for download.

## What it does

This script scans a folder containing APK files and generates:
- `product.inf` - A CSV file containing package metadata
- `product.infz` - A ZIP file containing `product.inf` and icon PNG files

These files are required for ATAK to recognize and download updates from your TAK server.

## Requirements

- Node.js (v14 or higher) - [Download here](https://nodejs.org/)
- APK files in a folder

## Installation

1. Open a terminal/command prompt in this folder
2. Run: `npm install`

**Linux users:** After installation, make the shell script executable:
```bash
chmod +x build-update.sh
```

## Usage

### Windows

**Option 1: Using the batch file**

1. Double-click `build-update.bat` or run it from command prompt
2. Or specify a folder: `build-update.bat "C:\path\to\apk\folder"`

**Option 2: Using Node.js directly**

```bash
node build-update.js [folder_path]
```

### Linux

**Option 1: Using the shell script**

**Important:** Before first use, make the script executable:
```bash
chmod +x build-update.sh
```

Then run the script:
   ```bash
   ./build-update.sh [folder_path]
   ```

   Or specify a folder:
   ```bash
   ./build-update.sh /path/to/apk/folder
   ```

**Option 2: Using Node.js directly**

```bash
node build-update.js [folder_path]
```

**Note:** If no folder is specified, it will use the current directory.

## Deploying to TAK Server

After running the script, you need to copy all files to your TAK server:

1. **Copy all APK files** to `/opt/tak/webcontent/update/` on your TAK server
2. **Copy `product.infz`** to `/opt/tak/webcontent/update/product.infz` on your TAK server
3. **Copy `product.inf`** to `/opt/tak/webcontent/update/product.inf` on your TAK server (optional, for reference)

### Example deployment commands (Linux):

```bash
# Copy APK files
scp *.apk user@tak-server:/opt/tak/webcontent/update/

# Copy generated files
scp product.infz user@tak-server:/opt/tak/webcontent/update/
scp product.inf user@tak-server:/opt/tak/webcontent/update/
```

Or if you have direct access to the server:

```bash
# On your local machine, after running the script:
cp *.apk /opt/tak/webcontent/update/
cp product.infz /opt/tak/webcontent/update/
cp product.inf /opt/tak/webcontent/update/
```

### Verify file permissions:

```bash
# Ensure files are readable by the web server
chmod 644 /opt/tak/webcontent/update/*.apk
chmod 644 /opt/tak/webcontent/update/product.inf*
```

## Configuring ATAK Client (EUD)

After deploying the files to your TAK server, configure ATAK clients to use the update server:

1. Open ATAK on your device
2. Go to **Settings** → **Tool Preferences** → **Package Management** → **Gear Icon**
3. Enable **Update Server**
4. Enter the update server URL:
   ```
   https://serverip:8443/update
   ```
   Replace `serverip` with your TAK server's IP address or hostname.

5. Save the settings

The ATAK client will now check this URL for available plugins and apps. It will download `product.infz` from this location to see what's available.

**Note:** The update server URL must use HTTPS. If your TAK server is set up normally, it will be accessible at `https://serverip:8443/update`.

## How it works

1. Scans the specified folder for `.apk` files
2. Extracts metadata from each APK:
   - Package name (app ID)
   - Display name
   - Version information
   - Description
   - Icon
   - File hash (SHA256)
   - File size
3. Determines package type (app, plugin, or systemplugin)
4. Generates the `product.inf` CSV file
5. Creates a ZIP file (`product.infz`) with the CSV and all icons

## Example Workflow

### Windows Example

```
1. Prepare your APK files in a folder:
   C:\APKs\
     ├── ATAK-5.4.0.14-f7d8f588-civ-release.apk
     ├── ATAK-Plugin-datasync-3.5.27.apk
     └── ...

2. Run the build script:
   build-update.bat C:\APKs

3. Output files are created:
   C:\APKs\
     ├── product.inf
     ├── product.infz
     └── (all your APK files)

4. Copy everything to TAK server:
   /opt/tak/webcontent/update/
     ├── product.infz
     ├── product.inf
     └── (all your APK files)
```

### Linux Example

```
1. Prepare your APK files in a folder:
   /home/user/apks/
     ├── ATAK-5.4.0.14-f7d8f588-civ-release.apk
     ├── ATAK-Plugin-datasync-3.5.27.apk
     └── ...

2. Run the build script:
   ./build-update.sh /home/user/apks

3. Output files are created:
   /home/user/apks/
     ├── product.inf
     ├── product.infz
     └── (all your APK files)

4. Copy everything to TAK server:
   /opt/tak/webcontent/update/
     ├── product.infz
     ├── product.inf
     └── (all your APK files)
```

## Notes

- The script uses the APK manifest's `versionCode` (integer version code) for proper version comparison
- Package types are automatically detected based on app ID patterns
- Icons are extracted from APK files and included in the ZIP
- If an APK cannot be processed, it will be skipped with an error message
- The `product.infz` file must be accessible via HTTP/HTTPS from your TAK server's web content directory
- On Linux, ensure the shell script has execute permissions: `chmod +x build-update.sh`
