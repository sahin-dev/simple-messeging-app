import { registerAs } from "@nestjs/config";

const splitCsv = (value?: string) => value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

export const appleConfig = () => {
    const clientIds = [
        process.env.APPLE_CLIENT_ID,
        process.env.APPLE_BUNDLE_ID,
        process.env.APPLE_SERVICE_ID,
        ...splitCsv(process.env.APPLE_CLIENT_IDS),
    ].filter(Boolean) as string[];

    return {
        clientIds: [...new Set(clientIds)],
        keysUrl: process.env.APPLE_KEYS_URL || "https://appleid.apple.com/auth/keys",
    };
};

export default registerAs("apple", appleConfig);
