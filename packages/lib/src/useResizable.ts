"use client";

import { useCallback, useRef, useEffect, useState } from "react";

interface UseResizableOptions {
    /** Which edge the handle sits on: "left" means drag the left border, "right" means drag the right border */
    side: "left" | "right";
    /** Minimum width in px */
    min?: number;
    /** Maximum width in px */
    max?: number;
    /** Initial width in px */
    initial: number;
    /** Called with new width when drag ends */
    onResize?: (width: number) => void;
}

export function useResizable({
    side,
    min = 180,
    max = 800,
    initial,
    onResize,
}: UseResizableOptions) {
    const [width, setWidth] = useState(initial);
    const dragging = useRef(false);
    const startX = useRef(0);
    const startW = useRef(0);

    // Sync if initial changes externally (e.g. from persisted state)
    useEffect(() => {
        setWidth(initial);
    }, [initial]);

    const onMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            dragging.current = true;
            startX.current = e.clientX;
            startW.current = width;
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
        },
        [width],
    );

    useEffect(() => {
        function onMouseMove(e: MouseEvent) {
            if (!dragging.current) return;
            const dx = e.clientX - startX.current;
            const newW =
                side === "right"
                    ? startW.current + dx
                    : startW.current - dx;
            setWidth(Math.max(min, Math.min(max, newW)));
        }

        function onMouseUp() {
            if (!dragging.current) return;
            dragging.current = false;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            // Read the latest width from the state
            setWidth((w) => {
                onResize?.(w);
                return w;
            });
        }

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, [side, min, max, onResize]);

    return { width, onMouseDown };
}
