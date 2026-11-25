import { createElement, type FormEvent } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { useAuthForm } from "./use-auth-form";
import {
  validateLoginForm,
  validateSignupForm,
  type SignupFormValues,
} from "./auth-form-validation";

afterEach(() => vi.unstubAllGlobals());

function formHandler(
  identifier: string,
  password: string,
  submit: () => Promise<void>,
  validate = validateLoginForm,
) {
  let handlers!: ReturnType<
    typeof useAuthForm<{ identifier: string; password: string }>
  >;
  function Probe() {
    handlers = useAuthForm({ identifier, password }, validate, submit, "login");
    return null;
  }
  renderToString(createElement(Probe));
  return handlers;
}

it("does not send invalid form data and focuses the first invalid input", async () => {
  const focus = vi.fn();
  class Input {
    focus = focus;
  }
  vi.stubGlobal("HTMLElement", Input);
  const namedItem = vi.fn(() => new Input());
  const submit = vi.fn();
  const { handleSubmit } = formHandler(" ", "", submit);
  await handleSubmit({
    preventDefault: vi.fn(),
    currentTarget: { elements: { namedItem } },
  } as unknown as FormEvent<HTMLFormElement>);
  expect(namedItem).toHaveBeenCalledWith("identifier");
  expect(focus).toHaveBeenCalledOnce();
  expect(submit).not.toHaveBeenCalled();
});

it("sends only one request while a valid submission is pending", async () => {
  let finish!: () => void;
  const submit = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const { handleSubmit } = formHandler("listener", "password", submit);
  const event = {
    preventDefault: vi.fn(),
  } as unknown as FormEvent<HTMLFormElement>;
  const first = handleSubmit(event);
  await handleSubmit(event);
  expect(submit).toHaveBeenCalledOnce();
  finish();
  await first;
});

it("validates signup credentials independently without submitting or blocking on profile fields", () => {
  const submit = vi.fn();
  let validateForm!: (
    element: HTMLFormElement,
    fields?: readonly (keyof SignupFormValues)[],
  ) => boolean;
  function Probe() {
    ({ validateForm } = useAuthForm(
      {
        email: "listener@example.test",
        password: "Music123!",
        displayName: "",
        username: "",
      },
      validateSignupForm,
      submit,
      "signup",
    ));
    return null;
  }
  renderToString(createElement(Probe));
  const focus = vi.fn();
  class Input {
    focus = focus;
  }
  vi.stubGlobal("HTMLElement", Input);
  const namedItem = vi.fn(() => new Input());
  const element = { elements: { namedItem } } as unknown as HTMLFormElement;

  expect(validateForm(element, ["email", "password"])).toBe(true);
  expect(namedItem).not.toHaveBeenCalled();
  expect(validateForm(element)).toBe(false);
  expect(namedItem).toHaveBeenCalledWith("displayName");
  expect(focus).toHaveBeenCalledOnce();
  expect(submit).not.toHaveBeenCalled();
});

it("focuses an invalid visible field when validating a step", () => {
  const focus = vi.fn();
  class Input {
    focus = focus;
  }
  vi.stubGlobal("HTMLElement", Input);
  const namedItem = vi.fn(() => new Input());
  const { validateForm } = formHandler("", "", vi.fn());
  expect(
    validateForm({ elements: { namedItem } } as unknown as HTMLFormElement, [
      "password",
    ]),
  ).toBe(false);
  expect(namedItem).toHaveBeenCalledWith("password");
  expect(focus).toHaveBeenCalledOnce();
});

it.each([
  ["", 0],
  ["   ", 0],
  ["listener", 1],
] as const)(
  "validates on blur only when the field has content (%j)",
  (identifier, calls) => {
    const validate = vi.fn(validateLoginForm);
    const { validateField } = formHandler(identifier, "", vi.fn(), validate);
    validateField("identifier");
    expect(validate).toHaveBeenCalledTimes(calls);
  },
);
