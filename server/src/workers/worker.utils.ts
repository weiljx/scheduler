import type { SchedulerProcessLike } from '../models/types.js';

export function normalizeBoolean(value: string | undefined, fallback: boolean): boolean {
    
    if (value === undefined) {
        return fallback;
    }

    const normalized = value.trim().toLowerCase();

    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
    }

    if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
    }

    return fallback;
}

export function normalizePositiveInteger(value: string | undefined, fallback: number): number {
    
    if (value === undefined) {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);

    if (Number.isNaN(parsed) || parsed <= 0) {
        return fallback;
    }

    return parsed;
}

export function resolveProcess(customProcess?: SchedulerProcessLike): SchedulerProcessLike {
    
    if (customProcess) {
        return customProcess;
    }

    const candidate = (globalThis as { process?: unknown }).process as
        | SchedulerProcessLike
        | undefined;

    if (candidate &&
        typeof candidate.on === 'function' &&
        candidate.env &&
        typeof candidate.exit === 'function'
) {
        return candidate;
    }

    return {
        env: {},
        on: () => undefined,
        off: () => undefined,
        exit: () => undefined,
        kill: () => undefined,
    };
}

export function hasUnref(timer: unknown): timer is { unref: () => void } {
    return (
        typeof timer === 'object' &&
        timer !== null &&
        typeof (timer as { unref?: unknown }).unref === 'function'
    );
}

