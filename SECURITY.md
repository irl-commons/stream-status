# Security

Please report security problems privately through GitHub: open the
**Security** tab of this repository and choose **Report a vulnerability**.
Don't open a public issue for them.

What counts here:

- the validator or reference reader crashing, hanging or misbehaving on
  crafted input;
- anything in the format or its reader rules that would let a reader show a
  healthier picture than the sender reported;
- anything that would push private data (names, locations, device or network
  identifiers) into snapshots or in-band messages.

This repository holds a specification and a small tool. It runs no service.
