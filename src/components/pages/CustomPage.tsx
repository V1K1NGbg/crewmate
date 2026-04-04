"use client";

export default function CustomPage({ url }: { url?: string }) {
    if (!url) {
        return (
            <div className="flex-1 flex items-center justify-center bg-bg text-text-3 text-sm">
                No URL configured for this page.
            </div>
        );
    }
    return <iframe src={url} className="flex-1 w-full border-none bg-bg" />;
}
