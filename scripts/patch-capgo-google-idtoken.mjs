/**
 * Capgo GoogleProvider online mode waits for AuthorizationClient access tokens after the
 * account picker. That step often fails on Capacitor (ActivityResult forwarding / consent UI)
 * even when a Firebase-valid Google ID token is already available.
 *
 * Firebase Auth only needs the ID token. This patch resolves login as soon as Credential Manager
 * returns GoogleIdTokenCredential, making Android Google Sign-In match email login reliability.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const workspaceRoot = process.cwd();
const targetPath = path.join(
  workspaceRoot,
  'node_modules',
  '@capgo',
  'capacitor-social-login',
  'android',
  'src',
  'main',
  'java',
  'ee',
  'forgr',
  'capacitor',
  'social',
  'login',
  'GoogleProvider.java',
);

const MARKER = 'NET360_FIREBASE_IDTOKEN_ONLY';

if (!fs.existsSync(targetPath)) {
  console.error('[patch-capgo-google] GoogleProvider.java not found at', targetPath);
  process.exit(1);
}

let source = fs.readFileSync(targetPath, 'utf8');
if (source.includes(MARKER)) {
  console.log('[patch-capgo-google] Already patched (Firebase idToken-only).');
  process.exit(0);
}

const needle = `                    GoogleIdTokenCredential googleIdTokenCredential = GoogleIdTokenCredential.createFrom(credential.getData());
                    ListenableFuture<AuthorizationResult> future = getAuthorizationResult(forceRefreshToken);

                    // Use ExecutorService to retrieve the access token
                    ExecutorService executor = Executors.newSingleThreadExecutor();

                    executor.execute(
                        new Runnable() {
                            @Override
                            public void run() {
                                try {
                                    AuthorizationResult result = future.get();
                                    if (GoogleProvider.this.mode == GoogleProviderLoginType.ONLINE) {
                                        if (result.getAccessToken() != null) {
                                            JSObject accessTokenObj = new JSObject();
                                            accessTokenObj.put("token", result.getAccessToken());
                                            // accessTokenObj.put("userId", accessToken.userId);

                                            resultObj.put("accessToken", accessTokenObj);
                                            resultObj.put("profile", user);
                                            resultObj.put("idToken", googleIdTokenCredential.getIdToken());
                                            resultObj.put("responseType", "online");
                                            response.put("result", resultObj);
                                            persistState(googleIdTokenCredential.getIdToken(), result.getAccessToken());
                                            call.resolve(response);
                                        } else {
                                            call.reject("Failed to get access token");
                                        }
                                    } else {
                                        if (result.getServerAuthCode() != null) {
                                            resultObj.put("responseType", "offline");
                                            resultObj.put("serverAuthCode", result.getServerAuthCode());
                                            response.put("result", resultObj);
                                            call.resolve(response);
                                        } else {
                                            call.reject("Failed to get serverAuthCode");
                                        }
                                    }
                                } catch (Exception e) {
                                    call.reject("Error retrieving access token: " + e.getMessage());
                                } finally {
                                    executor.shutdown();
                                }
                            }
                        }
                    );

                    return; // The call will be resolved in the Runnable`;

const replacement = `                    GoogleIdTokenCredential googleIdTokenCredential = GoogleIdTokenCredential.createFrom(credential.getData());
                    // ${MARKER}: Firebase Auth only needs the Google ID token from Credential Manager.
                    // Skipping AuthorizationClient access-token fetch avoids post-picker failures on Capacitor.
                    if (GoogleProvider.this.mode == GoogleProviderLoginType.ONLINE) {
                        String idTokenValue = googleIdTokenCredential.getIdToken();
                        if (idTokenValue == null || idTokenValue.isEmpty()) {
                            call.reject("Failed to get Google ID token");
                            return;
                        }
                        resultObj.put("profile", user);
                        resultObj.put("idToken", idTokenValue);
                        resultObj.put("responseType", "online");
                        response.put("result", resultObj);
                        try {
                            persistState(idTokenValue, "");
                        } catch (JSONException persistError) {
                            Log.w(LOG_TAG, "Could not persist Google idToken state", persistError);
                        }
                        Log.i(LOG_TAG, "Resolving Google login with ID token for Firebase (access token skipped)");
                        call.resolve(response);
                        return;
                    }

                    ListenableFuture<AuthorizationResult> future = getAuthorizationResult(forceRefreshToken);
                    ExecutorService executor = Executors.newSingleThreadExecutor();
                    executor.execute(
                        new Runnable() {
                            @Override
                            public void run() {
                                try {
                                    AuthorizationResult result = future.get();
                                    if (result.getServerAuthCode() != null) {
                                        resultObj.put("responseType", "offline");
                                        resultObj.put("serverAuthCode", result.getServerAuthCode());
                                        response.put("result", resultObj);
                                        call.resolve(response);
                                    } else {
                                        call.reject("Failed to get serverAuthCode");
                                    }
                                } catch (Exception e) {
                                    call.reject("Error retrieving serverAuthCode: " + e.getMessage());
                                } finally {
                                    executor.shutdown();
                                }
                            }
                        }
                    );

                    return; // Offline mode resolves in the Runnable`;

if (!source.includes(needle)) {
  console.error('[patch-capgo-google] Expected Capgo GoogleProvider block not found. Plugin version may have changed.');
  process.exit(1);
}

source = source.replace(needle, replacement);
fs.writeFileSync(targetPath, source, 'utf8');
console.log('[patch-capgo-google] Patched GoogleProvider for Firebase ID-token login.');
