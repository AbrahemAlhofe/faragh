export default class Cache {
    private stack: Record<string, string> = {};
    private readonly limit: number = 5;

    constructor(limit: number = 5) {
        this.limit = limit;
    }

    add(key: string, value: string): void {
        if (Object.keys(this.stack).length >= this.limit) {
            delete this.stack[Object.keys(this.stack)[0]];
        }
        this.stack[key] = value
    }

    getAll(): string[] {
        return this.stack ? Object.values(this.stack) : [];
    }

    toString(): string {
        if (Object.keys(this.stack).length === 0) return '';
        return Object.entries(this.stack).map(([key, value]) => `${key} : ${value}`).join('\n');
    }
}