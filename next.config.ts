const { version } = require('./package.json');
import type { NextConfig } from "next";

console.log(process.env);

const nextConfig: NextConfig = {
    env: {
        version
    }
};

export default nextConfig;