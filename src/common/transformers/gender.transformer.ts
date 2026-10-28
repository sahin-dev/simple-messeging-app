import { TransformFnParams } from "class-transformer";

export const transformGender = ({ value }: TransformFnParams) => {
    if (typeof value !== "string") {
        return value;
    }

    return value.trim().toUpperCase().replace(/[\s-]+/g, "_");
};
