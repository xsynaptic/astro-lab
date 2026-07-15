// Utility functions for Prettier to format embedded styles and markup
export const css = (strings: TemplateStringsArray, ...values: Array<number | string>): string =>
	String.raw({ raw: strings }, ...values);

export const html = (strings: TemplateStringsArray, ...values: Array<number | string>): string =>
	String.raw({ raw: strings }, ...values);
