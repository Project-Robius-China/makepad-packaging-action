import * as core from '@actions/core';
import stringArgv from 'string-argv';
import type { Artifact, BuildOptions, InitOptions } from './types';
import { buildProject } from './build';
import { resolve } from 'node:path';


async function run(): Promise<void> {
  try {
    console.log('Starting Makepad Packaging Action...');
    const projectPath = resolve(
      process.cwd(),
      core.getInput('project_path') || process.argv[2],
    );

    const args = stringArgv(core.getInput('args'));

    const app_name = core.getInput('app_name');
    const app_version = core.getInput('app_version');
    const include_debug = core.getBooleanInput('include_debug'); // default: false
    const include_release = core.getBooleanInput('include_release'); // default: true

    const identifier = core.getInput('identifier');

    const build_options: BuildOptions = {
      args,
    };

    const init_options: InitOptions = {
      identifier,
      app_name,
      app_version,
    };


    const release_artifacts: Artifact[] = [];
    const debug_artifacts: Artifact[] = [];

    if (include_release) {
      release_artifacts.push(
        ...(await buildProject(
          projectPath,
          false,
          init_options,
          build_options,
        ))
      )
    }

    if (include_debug) {
      debug_artifacts.push(
        ...(await buildProject(
          projectPath,
          true,
          init_options,
          build_options,
        ))
      )
    }

    const artifacts = release_artifacts.concat(debug_artifacts);

    if (artifacts.length === 0) {
      console.log('No artifacts were built.');
      return;
    }

    console.log(`Found artifacts:\n${artifacts.map((a) => a.path).join('\n')}`);

  } catch (error) {
    //@ts-expect-error
    core.setFailed(error.message);
  }
}

await run();