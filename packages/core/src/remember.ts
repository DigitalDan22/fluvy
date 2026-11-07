/**
 * `make`, remembering its last answer: asked again with the same inputs (each the very object or value it had), it
 * answers the object it made last, so whoever compares by reference — a card's `shouldUpdate` — sees a change only
 * where there was one.
 */
export function remember<A extends readonly unknown[], R>(
  make: (...inputs: A) => R,
): (...inputs: A) => R {
  let last: { readonly inputs: A; readonly made: R } | undefined;
  return (...inputs) => {
    if (!last || inputs.some((input, i) => input !== last!.inputs[i]))
      last = { inputs, made: make(...inputs) };
    return last.made;
  };
}
