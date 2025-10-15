import { getProcessor } from '../../processors/registry.js';
import { DefaultProcessor } from '../../processors/default.processor.js';

describe('processor registry', () => {
    it('returns the default processor when type is missing', () => {
        const processor = getProcessor(undefined);
        expect(processor.type).toBe(DefaultProcessor.type);
    });

    it('returns the default processor when type is unknown', () => {
        const processor = getProcessor('unknown-type');
        expect(processor.type).toBe(DefaultProcessor.type);
    });
});

