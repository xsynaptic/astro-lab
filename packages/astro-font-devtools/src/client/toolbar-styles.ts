import { css } from './dom-tags.js';
import { rowHeight } from './tokens.js';

export const toolbarStyles = css`
	.fdt-panel {
		font-family: system-ui, sans-serif;
		min-width: 34rem;
	}
	.fdt-status {
		font-size: 0.8125rem;
		color: rgba(255, 255, 255, 0.5);
		padding: 0.25rem 0;
	}
	.fdt-status.fdt-error {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: auto;
		padding: 0;
		color: #cf6679;
	}
	#fdt-rows {
		max-height: min(60vh, 28rem);
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.22) transparent;
	}
	font-target-row {
		display: block;
		padding: 0.3rem 0;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}
	font-target-row:first-of-type {
		border-top: 0;
		padding-top: 0;
	}
	font-target-row:last-of-type {
		padding-bottom: 0;
	}
	.fdt-rmain {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 7rem minmax(0, 1fr) auto auto auto;
		gap: 0.4rem;
		align-items: center;
	}
	.fdt-rmain > * {
		min-width: 0;
	}
	.fdt-target {
		width: 100%;
		box-sizing: border-box;
		font-family: ui-monospace, monospace;
		font-size: 0.8125rem;
		background: rgba(255, 255, 255, 0.08);
		color: inherit;
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 0.25rem;
		padding: 0.25rem 0.5rem;
	}
	.fdt-target:focus {
		outline: 2px solid rgba(113, 24, 226, 0.4);
		outline-offset: -1px;
	}
	.fdt-category {
		width: 100%;
		box-sizing: border-box;
		font: inherit;
		font-size: 0.8125rem;
		background: rgba(255, 255, 255, 0.08);
		color: inherit;
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 0.25rem;
		padding: 0.25rem 0.4rem;
	}
	.fdt-iconbtn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.4rem;
		height: 1.4rem;
		box-sizing: border-box;
		padding: 0;
		font-size: 0.9rem;
		cursor: pointer;
		border-radius: 0.25rem;
		border: 1px solid rgba(255, 255, 255, 0.16);
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.45);
	}
	.fdt-iconbtn:not([disabled]):hover {
		color: rgba(255, 255, 255, 0.8);
	}
	.fdt-italic[aria-pressed='true'] {
		background: rgba(113, 24, 226, 0.25);
		border-color: rgba(113, 24, 226, 0.5);
		color: #fff;
	}
	.fdt-iconbtn[disabled] {
		opacity: 0.4;
		cursor: default;
	}
	.fdt-iconbtn svg {
		width: 0.8em;
		height: 0.8em;
	}
	.fdt-select {
		width: 3.75rem;
		box-sizing: border-box;
		font: inherit;
		font-size: 0.8125rem;
		background: rgba(255, 255, 255, 0.08);
		color: inherit;
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 0.25rem;
		padding: 0.2rem 0.3rem;
	}
	.fdt-select:disabled {
		opacity: 0.4;
	}
	.fdt-combobox {
		position: relative;
	}
	.fdt-combobox input {
		width: 100%;
		font: inherit;
		font-size: 0.8125rem;
		background: rgba(255, 255, 255, 0.08);
		color: inherit;
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 0.25rem;
		padding: 0.25rem 1.5rem 0.25rem 0.5rem;
		box-sizing: border-box;
	}
	.fdt-combobox input:focus {
		outline: 2px solid rgba(113, 24, 226, 0.4);
		outline-offset: -1px;
	}
	.fdt-combo-clear {
		position: absolute;
		top: 50%;
		right: 0.3rem;
		transform: translateY(-50%);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.1rem;
		height: 1.1rem;
		padding: 0;
		border: 0;
		border-radius: 0.2rem;
		background: transparent;
		color: rgba(255, 255, 255, 0.4);
		cursor: pointer;
	}
	.fdt-combo-clear:hover {
		color: rgba(255, 255, 255, 0.85);
	}
	.fdt-combo-clear[hidden] {
		display: none;
	}
	.fdt-combo-clear svg {
		width: 0.75em;
		height: 0.75em;
	}
	.fdt-dropdown {
		position: fixed;
		z-index: 2147483647;
		margin: 0;
		padding: 0;
		list-style: none;
		overflow-y: auto;
		background: #1f1f24;
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 0.25rem;
		font-family: system-ui, sans-serif;
		font-size: 0.8125rem;
		color: rgba(255, 255, 255, 0.86);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.22) transparent;
	}
	.fdt-dropdown::-webkit-scrollbar,
	#fdt-rows::-webkit-scrollbar {
		width: 10px;
		background: transparent;
	}
	.fdt-dropdown::-webkit-scrollbar-thumb,
	#fdt-rows::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.18);
		border-radius: 5px;
		border: 3px solid transparent;
		background-clip: padding-box;
	}
	.fdt-dropdown::-webkit-scrollbar-thumb:hover,
	#fdt-rows::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.32);
		background-clip: padding-box;
	}
	.fdt-sizer {
		position: relative;
		width: 100%;
	}
	.fdt-option {
		position: absolute;
		left: 0;
		right: 0;
		height: ${rowHeight}px;
		box-sizing: border-box;
		padding: 0 0.5rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		cursor: pointer;
	}
	.fdt-option:hover,
	.fdt-option.fdt-active {
		background: rgba(113, 24, 226, 0.2);
	}
	.fdt-fam {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.fdt-var {
		flex: none;
		font-size: 0.625rem;
		font-weight: 600;
		letter-spacing: 0.03em;
		padding: 0 0.3em;
		border-radius: 0.2rem;
		background: rgba(113, 24, 226, 0.25);
		color: rgba(255, 255, 255, 0.85);
	}
	.fdt-disabled {
		opacity: 0.4;
		pointer-events: none;
	}
	.fdt-rows-locked .fdt-rmain > *:not([data-action='delete']) {
		opacity: 0.4;
		pointer-events: none;
	}
	.fdt-foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.4rem;
		padding-top: 0.4rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}
	#fdt-rows:empty + .fdt-foot {
		margin-top: 0;
		padding-top: 0;
		border-top: 0;
	}
	.fdt-providers {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem;
	}
	.fdt-providers[hidden] {
		display: none;
	}
	.fdt-providers-label {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.4);
		margin-right: 0.1rem;
	}
	astro-dev-toolbar-button:hover {
		filter: brightness(1.15);
		background: rgba(255, 255, 255, 0.07);
		border-radius: 0.25rem;
	}
	.fdt-scripts {
		margin-left: auto;
	}
	.fdt-scripts[hidden] {
		display: none;
	}
	.fdt-scripts-panel {
		position: fixed;
		z-index: 2147483647;
		display: flex;
		flex-direction: column;
		min-width: 13rem;
		overflow: hidden;
		background: #1f1f24;
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 0.25rem;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
		font-family: system-ui, sans-serif;
		font-size: 0.8125rem;
		color: rgba(255, 255, 255, 0.86);
	}
	.fdt-scripts-panel[hidden] {
		display: none;
	}
	.fdt-scripts-head {
		display: flex;
		gap: 0.3rem;
		padding: 0.4rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}
	.fdt-scripts-search {
		flex: 1;
		min-width: 0;
		font: inherit;
		font-size: 0.8125rem;
		background: rgba(255, 255, 255, 0.08);
		color: inherit;
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 0.25rem;
		padding: 0.2rem 0.4rem;
		box-sizing: border-box;
	}
	.fdt-scripts-clear {
		font: inherit;
		font-size: 0.7rem;
		cursor: pointer;
		padding: 0 0.45rem;
		border-radius: 0.25rem;
		border: 1px solid rgba(255, 255, 255, 0.16);
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.6);
	}
	.fdt-scripts-list {
		overflow-y: auto;
		padding: 0.25rem;
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.22) transparent;
	}
	.fdt-scripts-item {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.2rem 0.35rem;
		border-radius: 0.2rem;
		cursor: pointer;
	}
	.fdt-scripts-item:hover {
		background: rgba(113, 24, 226, 0.2);
	}
`;
