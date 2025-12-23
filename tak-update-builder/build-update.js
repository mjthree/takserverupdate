const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Apk } = require('node-apk');
const JSZip = require('jszip');

// Configuration
const APK_FOLDER = process.argv[2] || process.cwd();
const OUTPUT_FILE = path.join(APK_FOLDER, 'product.infz');
const OUTPUT_TXT = path.join(APK_FOLDER, 'product.inf');

/**
 * Determine package type based on app ID
 * - com.atakmap.app.flavor.* = systemplugin
 * - com.atakmap.android.*.plugin = plugin
 * - Everything else = app
 */
function getPackageType(appId) {
    // System plugins have pattern: com.atakmap.app.flavor.*
    if (appId.startsWith('com.atakmap.app.flavor.')) {
        return 'systemplugin';
    }
    // Regular plugins: com.atakmap.android.*.plugin
    if (appId.startsWith('com.atakmap.android') && appId.endsWith('.plugin')) {
        return 'plugin';
    }
    // Everything else is an app
    return 'app';
}

/**
 * Extract TAK prerequisite from version string, app ID, or filename
 */
function getTakPrereq(appId, versionName, filename) {
    // Try to extract from version name (e.g., "3.5.27 (1ad526bf) - [5.4.0]")
    let versionMatch = versionName.match(/\[([\d.]+)\]/);
    let takVersion = null;
    
    if (versionMatch) {
        takVersion = versionMatch[1];
    } else {
        // Try to extract from filename (e.g., "ATAK-Plugin-datasync-3.5.27-...-5.4.0-civ-release.apk")
        const filenameMatch = filename.match(/-([\d.]+)-(civ|mil|CIV|MIL)-/);
        if (filenameMatch) {
            takVersion = filenameMatch[1];
        } else {
            // Try to extract from app ID patterns
            const appIdMatch = appId.match(/@([\d.]+)\.(CIV|MIL)/);
            if (appIdMatch) {
                takVersion = appIdMatch[1];
            }
        }
    }
    
    if (takVersion) {
        // Determine flavor from app ID or filename
        const isMil = appId.includes('mil') || appId.includes('MIL') || 
                     filename.includes('-mil-') || filename.includes('-MIL-');
        const isCiv = appId.includes('civ') || appId.includes('CIV') || 
                     filename.includes('-civ-') || filename.includes('-CIV-');
        
        if (isMil) {
            return `com.atakmap.app@${takVersion}.MIL`;
        } else if (isCiv) {
            return `com.atakmap.app@${takVersion}.CIV`;
        }
    }
    
    return '';
}

// Note: extractVersionCode function removed - we now use manifest.versionCode directly
// which is the proper integer version code from the APK manifest

/**
 * Format version string - try to preserve original format
 */
function formatVersion(versionName, filename) {
    // If versionName already has the format we want, use it
    if (versionName && versionName.length > 0) {
        return versionName;
    }
    
    // Try to extract from filename as fallback
    // This is a best-effort approach
    return versionName || '1.0.0';
}

/**
 * Read APK file and extract metadata
 */
async function readApk(apkPath) {
    const apk = new Apk(apkPath);
    
    try {
        const manifest = await apk.getManifestInfo();
        const resources = await apk.getResources();
        
        // Get app name
        let name = manifest.applicationLabel;
        if (typeof name !== 'string') {
            const resolved = resources.resolve(name);
            if (resolved && resolved.length > 0) {
                name = resolved[0].value;
            } else {
                name = manifest.package.split('.').pop();
            }
        }
        
        // Get min SDK
        const minSDK = manifest.raw?.children?.['uses-sdk']?.[0]?.attributes?.minSdkVersion || '1';
        
        // Get icon
        const iconAttr = manifest.raw?.children?.application?.[0]?.attributes?.icon;
        let iconData = null;
        let iconPath = '';
        
        if (iconAttr) {
            try {
                const iconResolved = resources.resolve(iconAttr);
                if (iconResolved && iconResolved.length > 0) {
                    iconPath = iconResolved[0].value;
                    iconData = await apk.extract(iconPath);
                }
            } catch (e) {
                console.warn(`  Warning: Could not extract icon for ${manifest.package}`);
            }
        }
        
        // Get description
        let description = '';
        const appChildren = manifest.raw?.children?.application?.[0]?.children;
        if (appChildren && appChildren['meta-data']) {
            for (const meta of appChildren['meta-data']) {
                if (meta.attributes?.name === 'app_desc') {
                    const descResolved = resources.resolve(meta.attributes.value);
                    if (descResolved && descResolved.length > 0) {
                        description = descResolved[0].value;
                    }
                    break;
                }
            }
        }
        
        // Fallback to description attribute
        if (!description && manifest.raw?.children?.application?.[0]?.attributes?.description) {
            const descAttr = manifest.raw.children.application[0].attributes.description;
            const descResolved = resources.resolve(descAttr);
            if (descResolved && descResolved.length > 0) {
                description = descResolved[0].value;
            }
        }
        
        // Sanitize description: remove newlines and replace with spaces
        // ATAK-20023: Multiline descriptions mess up the product.inf file
        if (description) {
            description = description.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
        }
        
        // Get file stats
        const stats = fs.statSync(apkPath);
        const fileBuffer = fs.readFileSync(apkPath);
        const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        const filename = path.basename(apkPath);
        
        // Use the actual versionCode from the APK manifest (integer that increases with each version)
        // This is what ATAK uses to determine if an update is available
        // Fallback to file modification time if versionCode is not available
        const versionCode = manifest.versionCode || Math.floor(stats.mtimeMs / 1000);
        
        // Use versionName from manifest for the version field in CSV
        return {
            appId: manifest.package,
            name: name,
            version: manifest.versionName || '1.0.0',
            versionCode: versionCode,
            versionName: manifest.versionName,
            minSDK: minSDK,
            description: description || '',
            icon: iconData,
            iconPath: iconPath,
            hash: hash,
            size: stats.size,
            filename: filename
        };
    } catch (e) {
        console.error(`Error reading APK ${apkPath}:`, e.message);
        return null;
    } finally {
        apk.close();
    }
}

/**
 * Main function to build update files
 */
async function buildUpdateFiles() {
    console.log(`Scanning folder: ${APK_FOLDER}`);
    
    // Find all APK files
    const files = fs.readdirSync(APK_FOLDER);
    const apkFiles = files.filter(f => f.toLowerCase().endsWith('.apk'));
    
    if (apkFiles.length === 0) {
        console.error('No APK files found in the specified folder!');
        process.exit(1);
    }
    
    console.log(`Found ${apkFiles.length} APK file(s)`);
    
    const packages = [];
    let packageId = 1;
    
    // Process each APK
    for (const apkFile of apkFiles) {
        const apkPath = path.join(APK_FOLDER, apkFile);
        console.log(`\nProcessing: ${apkFile}`);
        
        const pkg = await readApk(apkPath);
        if (!pkg) {
            console.error(`  Failed to process ${apkFile}`);
            continue;
        }
        
        const type = getPackageType(pkg.appId);
        const takPrereq = getTakPrereq(pkg.appId, pkg.version, pkg.filename);
        
        packages.push({
            id: packageId++,
            platform: 'Android',
            type: type,
            appId: pkg.appId,
            name: pkg.name,
            version: pkg.version,
            versionCode: pkg.versionCode,
            filename: pkg.filename,
            icon: pkg.icon,
            description: pkg.description,
            hash: pkg.hash,
            osRequirements: pkg.minSDK,
            takPrereq: takPrereq,
            size: pkg.size
        });
        
        console.log(`  ✓ ${pkg.name} (${pkg.appId})`);
        console.log(`    Type: ${type}, Version: ${pkg.version}`);
    }
    
    if (packages.length === 0) {
        console.error('No packages were successfully processed!');
        process.exit(1);
    }
    
    // Generate product.inf content
    console.log(`\nGenerating product.inf...`);
    const productInfLines = [];
    
    for (const pkg of packages) {
        // Match ATAK device output format:
        // Fields: platform, type, appId, name, version, versionCode, filename, icon, description, hash, osRequirements, takPrereq, size
        const line = [
            pkg.platform,
            pkg.type,
            pkg.appId,
            pkg.name,
            pkg.version,
            pkg.versionCode.toString(),
            pkg.filename || '', // APK filename (empty in device format, but needed for update server)
            pkg.icon ? `icon_${pkg.id}.png` : '', // Icon filename (empty in device format)
            pkg.description || '', // Description
            pkg.hash || '', // Hash (empty in device format, but needed for update server)
            pkg.osRequirements || '',
            pkg.takPrereq || '',
            pkg.size > 0 ? pkg.size.toString() : '-1' // Size (-1 in device format)
        ].join(',');
        
        productInfLines.push(line);
    }
    
    const productInfContent = productInfLines.join('\n');
    
    // Write product.inf text file
    fs.writeFileSync(OUTPUT_TXT, productInfContent, 'utf8');
    console.log(`  ✓ Created ${OUTPUT_TXT}`);
    
    // Create ZIP file (product.infz)
    console.log(`\nCreating product.infz...`);
    const zip = new JSZip();
    
    // Add product.inf to ZIP
    zip.file('product.inf', productInfContent);
    
    // Add icons to ZIP
    for (const pkg of packages) {
        if (pkg.icon) {
            zip.file(`icon_${pkg.id}.png`, pkg.icon);
        }
    }
    
    // Generate ZIP file
    const zipBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 }
    });
    
    fs.writeFileSync(OUTPUT_FILE, zipBuffer);
    console.log(`  ✓ Created ${OUTPUT_FILE}`);
    
    console.log(`\n✓ Successfully processed ${packages.length} package(s)!`);
    console.log(`\nFiles created:`);
    console.log(`  - ${OUTPUT_TXT}`);
    console.log(`  - ${OUTPUT_FILE}`);
}

// Run the script
buildUpdateFiles().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

