export interface StackPreset {
    name: string;
    description: string;
    rules: string;
    archetypeAgents: string[];
    claudeMdHeader: string;
}
export declare const STACKS: Record<string, StackPreset>;
export declare function getStack(name?: string): StackPreset | null;
//# sourceMappingURL=index.d.ts.map