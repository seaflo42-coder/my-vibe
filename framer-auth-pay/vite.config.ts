import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5174,
        host: "0.0.0.0",
    },
    resolve: {
        alias: {
            // 프레이머 에디터 외부에서 "framer" import를 로컬 shim으로 연결
            framer: path.resolve(__dirname, "framer-components/framer.ts"),
        },
    },
})
