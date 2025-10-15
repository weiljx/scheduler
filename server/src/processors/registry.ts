import type { Processor } from './processor.types.js';
import { DefaultProcessor } from './default.processor.js';

const defaultProcessor = new DefaultProcessor();
const registry = new Map<string, Processor>([
    [defaultProcessor.type.toLowerCase(), defaultProcessor],
]);

/**
 * Adds or replaces a processor implementation that can be resolved by type.
 *
 * @param processor Processor instance to register.
 */
export function registerProcessor(processor: Processor): void {
    registry.set(processor.type.toLowerCase(), processor);
}

/**
 * Returns the processor matching the provided type or the default when absent.
 *
 * @param type Optional processor identifier from a schedule/job record.
 */
export function getProcessor(type?: string): Processor {
    if (typeof type !== 'string' || type.trim().length === 0) {
        return registry.get(DefaultProcessor.type)!;
    }

    const normalized = type.trim().toLowerCase();
    return registry.get(normalized) ?? registry.get(DefaultProcessor.type)!;
}

/**
 * Lists unique processor instances currently registered.
 */
export function listProcessors(): Processor[] {
    return Array.from(new Set(registry.values()));
}
