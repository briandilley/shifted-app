# Wrap the Gmail web interface

Shifted shows Gmail's own web interface (`https://mail.google.com`) in an embedded web view, one web view per account. It does not call the Gmail API, and it does not draw mail itself.

A native client on the Gmail API needs Google to verify the app. It also needs a paid security audit for the restricted Gmail scopes. A native client also must rebuild every Gmail feature by hand. The web interface gives the user every Gmail feature on the first day. The cost is less control over how mail looks and behaves inside the web view.

## Considered Options

- Native client on the Gmail API, like Mimestream. Rejected for the cost and the Google verification above.
- IMAP client. Rejected because it loses Gmail labels, categories, and search as Gmail shows them.
