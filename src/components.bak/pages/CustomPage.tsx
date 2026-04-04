"use client";

export default function CustomPage({ url }: { url?: string }) {
    if (!url?.trim()) {
        return (
            <div className="flex-1 flex items-center justify-center text-[#484f58] text-sm">
                No URL configured for this page.
            </div>
        );
    }
    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            <iframe
                src={url.trim()}
                title="Custom page"
                className="flex-1 w-full border-none bg-white"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
            />
        </div>
    );
}
