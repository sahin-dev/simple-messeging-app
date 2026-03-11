import { Inject, Injectable, Logger } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import firebaseConfigType from "src/config/firebase.config";
import { App, cert, getApps, initializeApp, ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from "firebase-admin/messaging";
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class FireBaseClient {
    private readonly logger = new Logger(FireBaseClient.name);
    private app: App | undefined;

    constructor(@Inject(firebaseConfigType.KEY) private readonly firebaseConfig: ConfigType<typeof firebaseConfigType>) {
        try {
            this.initializeFirebaseApp();
        } catch (err) {
            this.logger.error('Failed to initialize Firebase app', err);
        }
    }

    /**
     * Send push notification to one or multiple devices
     * @param tokens FCM token(s)
     * @param title Notification title
     * @param body Notification body
     */
    async sendPushNotification(tokens: string | string[], title: string, body: string) {
        try {
            if (!this.app) {
                throw new Error("Firebase client is not configured correctly");
            }

            if (!tokens || (Array.isArray(tokens) && tokens.length <= 0)) {
                throw new Error("FCM token is invalid or empty");
            }

            if (!title || !body) {
                throw new Error("Notification title and body are required");
            }

            const messaging = getMessaging(this.app);

            if (Array.isArray(tokens)) {
                const result = await messaging.sendEachForMulticast({
                    tokens,
                    notification: {
                        title,
                        body
                    },
                });
                this.logger.log(`Sent multicast notification. Success: ${result.successCount}, Failure: ${result.failureCount}`);
                return result;
            } else {
                const result = await messaging.send({
                    token: tokens,
                    notification: {
                        title,
                        body
                    }
                });
                this.logger.log(`Sent notification successfully: ${result}`);
                return result;
            }
        } catch (err) {
            this.logger.error("Failed to send push notification", err);
            throw err;
        }
    }

    /**
     * Initialize Firebase app with multiple configuration methods
     */
    private initializeFirebaseApp() {
        try {
            // Check if already initialized
            const existingApps = getApps();
            if (existingApps.length > 0) {
                this.app = existingApps[0];
                this.logger.log('Using existing Firebase app');
                return;
            }

            let credential: any;

            // Method 1: Service account JSON string (preferred for production/Docker)
            if (this.firebaseConfig.serviceAccountJson) {
                this.logger.log('Initializing Firebase with JSON string configuration');
                const serviceAccount = JSON.parse(this.firebaseConfig.serviceAccountJson) as ServiceAccount;
                credential = cert(serviceAccount);
            }
            // Method 2: Service account file path (for development)
            else if (this.firebaseConfig.serviceAccountPath) {
                this.logger.log('Initializing Firebase with file path configuration');
                const absolutePath = path.resolve(process.cwd(), this.firebaseConfig.serviceAccountPath);

                if (!fs.existsSync(absolutePath)) {
                    throw new Error(`Firebase service account file not found at: ${absolutePath}`);
                }

                credential = cert(absolutePath);
            }
            // Method 3: Legacy support (backward compatibility)
            else if (this.firebaseConfig.firebase_secrets) {
                this.logger.warn('Using legacy firebase_secrets configuration. Consider migrating to serviceAccountPath or serviceAccountJson');
                const legacyPath = path.resolve(process.cwd(), "src/modules/notification/providers/softball-american.json");

                if (fs.existsSync(legacyPath)) {
                    credential = cert(legacyPath);
                } else {
                    throw new Error('Legacy Firebase configuration file not found');
                }
            }
            // Method 4: Application default credentials (for Google Cloud environments)
            else {
                this.logger.log('No explicit Firebase configuration found. Attempting to use application default credentials');
                // Firebase will use application default credentials
                this.app = initializeApp();
                this.logger.log('Firebase initialized with application default credentials');
                return;
            }

            this.app = initializeApp({ credential });
            this.logger.log('Firebase app initialized successfully');

            // Validate project ID if provided
            if (this.firebaseConfig.projectId && this.app.options.projectId !== this.firebaseConfig.projectId) {
                this.logger.warn(`Project ID mismatch. Expected: ${this.firebaseConfig.projectId}, Got: ${this.app.options.projectId}`);
            }
        } catch (err) {
            this.logger.error("Failed to initialize Firebase app", err);
            throw err;
        }
    }

    /**
     * Check if Firebase is initialized
     */
    isInitialized(): boolean {
        return !!this.app;
    }
}