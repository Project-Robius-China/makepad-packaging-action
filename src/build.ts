import { buildAndroidArtifacts, installAndroidBuildDependencies } from "./builds/android";
import { PackagingConfig } from "./config";
import type { Artifact, BuildOptions, InitOptions, MobileTarget, TargetArch, TargetInfo } from "./types";
import { execCommand, getTargetInfo, isCommandAvailable, retry } from "./utils";

export async function buildProject(
  root: string,
  debug: boolean,
  initOptions: InitOptions,
  buildOptions: BuildOptions,
): Promise<Artifact[]> {
  const args = debug
    ? (buildOptions.args ?? [])
    : (buildOptions.args ?? []).concat(['--release']);
  
  const target_arg_index = args.findIndex(
    (arg) => arg === '--target' || arg === '-t'
  )

  let target_triple: string | undefined;

  if (target_arg_index >= 0) {
    // Ensure that there is a value after the --target or -t argument
    const next = args[target_arg_index + 1];
    if (next && !next.startsWith('-')) {
      target_triple = next;
    }
  }
  
  const target_info = target_triple
    ? getTargetInfo(target_triple)
    : getTargetInfo();

  buildOptions = { 
    ...buildOptions, 
    target_info, 
    mode: debug ? 'debug' : 'release',
  };

  console.log(`======== Build Target Info ========\nTarget platform type: ${target_info.type}\nTarget platform: ${target_info.target_platform} (${target_info.arch})\n===================================`);

  const target_platform_type = target_info.type;
  if (target_platform_type === 'desktop') {
    // Desktop build logic
    return await buildDesktopArtifacts();
  } else if (target_platform_type === 'mobile') {
    // Check and install mobile packaging tools.
    await checkAndInstallMobilePackagingTools();
    return await buildMobileArtifacts(root, initOptions, buildOptions);
  } else {
    throw new Error(`Unsupported target type: ${target_platform_type}`);
  }
}

interface MobilePackagingToolsInfo {
  cargo_makepad_info: {
    installed: boolean;
    path?: string | undefined;
  }
}

// Use Makepad official `cargo-makepad` tool for mobile packaging.
// See `cargo-makepad` for more details: https://github.com/makepad/makepad/tree/dev/tools/cargo_makepad
async function checkAndInstallMobilePackagingTools(): Promise<MobilePackagingToolsInfo> {
  const packaging_tools_info: MobilePackagingToolsInfo = {
    cargo_makepad_info: {
      installed: false,
    },
  };

  // 1. Check `cargo-makepad` whether it is installed
  const { installed, path } = isCommandAvailable('cargo-makepad');
  if (installed) {
    console.log('✅ cargo-makepad already installed.');
    packaging_tools_info.cargo_makepad_info.installed = true;
    packaging_tools_info.cargo_makepad_info.path = path;
    return packaging_tools_info;
  }

  // 2. Install `cargo-makepad` if not installed
  console.log('⚙️  cargo-makepad not found. Installing...');
  await retry(async () => {
    await execCommand('cargo', [
      'install',
      '--force',
      '--git',
      'https://github.com/makepad/makepad.git',
      '--branch',
      'dev',
      'cargo-makepad',
    ]);
  }, 3, 5000, (attempt, err) => {
    console.warn(`❌ Attempt ${attempt} to install cargo-makepad failed:`, err);
    console.log('⏳ Retrying...');
  });

  // 3. Verify installation
  const verify = isCommandAvailable('cargo-makepad');
  if (!verify.installed) {
    throw new Error('Failed to install cargo-makepad.');
  }

  // 4. Update packaging tools info
  console.log('✅ cargo-makepad installed successfully.');
  packaging_tools_info.cargo_makepad_info.installed = verify.installed;
  packaging_tools_info.cargo_makepad_info.path = verify.path;

  return packaging_tools_info;
}

async function buildDesktopArtifacts(): Promise<Artifact[]> {
  console.log('Building for desktop...');
  return [];
}

async function buildMobileArtifacts(root: string, initOptions: InitOptions, buildOptions: BuildOptions): Promise<Artifact[]> {
  console.log('Building for mobile...');

  const { android_config } = PackagingConfig.fromMobilePackagingConfig(root);

  const { target_info: { target_platform, arch } } = buildOptions as {
    target_info: { target_platform: MobileTarget; arch: TargetArch };
  };

  if (target_platform === 'android') {

    const { app_version, app_name, identifier, main_binary_name } = initOptions;

    buildOptions.app_version = app_version ?? android_config.version;
    buildOptions.app_name = app_name ?? android_config.product_name;
    buildOptions.identifier = identifier ?? android_config.identifier;
    buildOptions.main_binary_name = main_binary_name ?? android_config.main_binary_name;

    // Ensure Android build dependencies are installed
    await installAndroidBuildDependencies(arch);

    return await buildAndroidArtifacts(
      root,
      buildOptions
    );
  }

  if (target_platform === 'ios') {
    return [];
  }

  return [];
}