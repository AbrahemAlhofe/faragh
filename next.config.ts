const { version } = require('./package.json');
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    eslint: {
        ignoreDuringBuilds: true,
    },
    env: {
        version,
        buildTime: new Date().toISOString(),
    }
};

export default nextConfig;