const fs = require('fs');
const path = require('path');

// 读取 package.json
const packagePath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

// 读取 manifest.json
const manifestPath = path.join(__dirname, '..', 'manifest.json');
const manifestJson = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// 解析版本号
const versionParts = packageJson.version.split('.');
let major = parseInt(versionParts[0]);
let minor = parseInt(versionParts[1]);
let patch = parseInt(versionParts[2]);

// 增加小版本号
patch++;

// 如果 patch 版本达到 100，增加 minor 版本
if (patch >= 100) {
  patch = 0;
  minor++;
}

// 如果 minor 版本达到 100，增加 major 版本
if (minor >= 100) {
  minor = 0;
  major++;
}

// 新版本号
const newVersion = `${major}.${minor}.${patch}`;

// 更新 package.json
packageJson.version = newVersion;
fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');

// 更新 manifest.json
manifestJson.version = newVersion;
fs.writeFileSync(manifestPath, JSON.stringify(manifestJson, null, 2) + '\n');

// 记录版本更新到日志文件
const changelogPath = path.join(__dirname, '..', 'VERSION_HISTORY.md');
const date = new Date().toISOString().split('T')[0];
const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
const logEntry = `\n- v${newVersion} (${date} ${time}): Build auto-increment`;

// 如果文件不存在，创建它
if (!fs.existsSync(changelogPath)) {
  fs.writeFileSync(changelogPath, `# Version History\n\n## Auto-generated version updates\n${logEntry}\n`);
} else {
  // 追加到文件末尾
  fs.appendFileSync(changelogPath, logEntry);
}

console.log(`✅ Version bumped: ${packageJson.version} → ${newVersion}`);
console.log(`📝 Updated: package.json, manifest.json`);
console.log(`📋 Logged to: VERSION_HISTORY.md`);