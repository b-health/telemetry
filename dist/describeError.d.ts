export interface DescribedErrorI {
    base?: Error;
    text: string;
}
export declare const describeError: (error: unknown) => DescribedErrorI;
