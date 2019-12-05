/*
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as toolCache from '@actions/tool-cache';
import {Base64} from 'js-base64';
import {promises as fs} from 'fs';
import path from 'path';
import * as tmp from 'tmp';
import * as os from 'os';
import * as clientUtil from './client-util';
import * as downloadUtil from './download-util';
import * as installUtil from './install-util';

async function run() {
  try {
    tmp.setGracefulCleanup();

    const version = core.getInput('version');
    if (!version) {
      throw new Error('Missing required parameter: `version`');
    }

    const serviceAccountEmail = core.getInput('service_account_email') || '';

    const serviceAccountKey = core.getInput('service_account_key');
    if (!serviceAccountKey) {
      throw new Error('Missing required input: `service_account_key`');
    }

    // install the gcloud is not already present
    let toolPath = toolCache.find('gcloud', version);
    if (!toolPath) {
      installGcloudSDK(version);
    }

    // write the service account key to a temporary file
    const tmpKeyFilePath = await new Promise<string>((resolve, reject) => {
      tmp.file({ postfix: '.json' }, (err, path, fd, cleanupCallback) => {
        if (err) {
          reject(err);
        }
        resolve(path);
      });
    });
    await fs.writeFile(tmpKeyFilePath, Base64.decode(serviceAccountKey));

    // authenticate as the specified service account
    await exec.exec(
      `gcloud auth activate-service-account ${serviceAccountEmail} --key-file=${tmpKeyFilePath}`,
    );
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function installGcloudSDK(version: string) {
  // retreive the release corresponding to the specified version and the current env
  const osPlat = os.platform();
  const osArch = os.arch();
  const release = await clientUtil.queryGcloudSDKRelease(
    osPlat,
    osArch,
    version,
  );
  if (!release) {
    throw new Error(
      `Failed to find release, os: ${osPlat} arch: ${osArch} version: ${version}`,
    );
  }

  // download and extract the release
  const extPath = await downloadUtil.downloadAndExtractTool(release!.url);
  if (!extPath) {
    throw new Error(`Failed to download release, url: ${release!.url}`);
  }

  // install the downloaded release into the github action env
  await installUtil.installGcloudSDK(version, extPath);
}

run();
