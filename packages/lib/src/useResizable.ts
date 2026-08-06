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
    const activePointer = useRef<number | null>(null);
    const startX = useRef(0);
    const startW = useRef(0);
    const widthRef = useRef(initial);
    const previousCursor = useRef("");
    const previousUserSelect = useRef("");
    const onResizeRef = useRef(onResize);

    useEffect(() => {
        onResizeRef.current = onResize;
    }, [onResize]);

    // Sync if initial changes externally (e.g. from persisted state)
    useEffect(() => {
        // The persisted panel width is an external value mirrored by the drag state.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setWidth(initial);
        widthRef.current = initial;
    }, [initial]);

    const finishDrag = useCallback(() => {
        if (!dragging.current) return;
        dragging.current = false;
        activePointer.current = null;
        document.body.style.cursor = previousCursor.current;
        document.body.style.userSelect = previousUserSelect.current;
        onResizeRef.current?.(widthRef.current);
    }, []);

    const onPointerDown = useCallback(
        (e: React.PointerEvent<HTMLElement>) => {
            if (e.button !== 0 || dragging.current) return;
            e.preventDefault();
            dragging.current = true;
            activePointer.current = e.pointerId;
            startX.current = e.clientX;
            startW.current = widthRef.current;
            e.currentTarget.setPointerCapture(e.pointerId);
            previousCursor.current = document.body.style.cursor;
            previousUserSelect.current = document.body.style.userSelect;
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
        },
        [],
    );

    const onPointerMove = useCallback(
        (e: React.PointerEvent<HTMLElement>) => {
            if (!dragging.current || e.pointerId !== activePointer.current) return;
            const dx = e.clientX - startX.current;
            const newW =
                side === "right"
                    ? startW.current + dx
                    : startW.current - dx;
            const clampedWidth = Math.max(min, Math.min(max, newW));
            widthRef.current = clampedWidth;
            setWidth(clampedWidth);
        },
        [side, min, max],
    );

    const onPointerUp = useCallback(
        (e: React.PointerEvent<HTMLElement>) => {
            if (e.pointerId !== activePointer.current) return;
            finishDrag();
        },
        [finishDrag],
    );

    useEffect(() => {
        const onWindowBlur = () => finishDrag();
        window.addEventListener("blur", onWindowBlur);
        return () => {
            window.removeEventListener("blur", onWindowBlur);
            finishDrag();
        };
    }, [finishDrag]);

    return {
        width,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel: onPointerUp,
        onLostPointerCapture: finishDrag,
    };
}
