import type { Processor } from './processor.types.js';
import { DefaultProcessor } from './default.processor.js';

const defaultProcessor = new DefaultProcessor();
const registry = new Map<string, Processor>([
    [defaultProcessor.type.toLowerCase(), defaultProcessor],
]);

export function registerProcessor(processor: Processor): void {
    registry.set(processor.type.toLowerCase(), processor);
}

export function getProcessor(type?: string): Processor {
    if (typeof type !== 'string' || type.trim().length === 0) {
        return registry.get(DefaultProcessor.type)!;
    }

    const normalized = type.trim().toLowerCase();
    return registry.get(normalized) ?? registry.get(DefaultProcessor.type)!;
}

export function listProcessors(): Processor[] {
    return Array.from(new Set(registry.values()));
}

