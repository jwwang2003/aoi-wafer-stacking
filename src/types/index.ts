// Global types, casts, and helpers

// Use some Typescript magic to convert between snake and camel casing
export type SnakeToCamel<S extends string> =
    S extends `${infer T}_${infer U}` ? `${T}${Capitalize<SnakeToCamel<U>>}` : S;

// Converts 
export type CastToCamel<T> = {
    [K in keyof T as SnakeToCamel<string & K>]: T[K]
};


