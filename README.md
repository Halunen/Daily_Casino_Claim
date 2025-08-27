| Key                     | Type    | Description                                                                                                       |
| ----------------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| `intervalMinutes`       | number  | How often (in minutes) this site runs automatically. Overrides `sites.json`.                                      |
| `username`              | string  | Username/email for login (if required).                                                                           |
| `password`              | string  | Password for login.                                                                                               |
| `loginRequiredSelector` | string  | If this selector exists, login flow will trigger. If not, tasks are run directly.                                 |
| `login`                 | object  | Configuration for login (see below).                                                                              |
| `solveCaptcha`          | boolean | If `true`, extension will attempt to solve reCAPTCHA/NoCaptcha using AntiCaptcha. If `false`, CAPTCHA is skipped. |
| `delays`                | object  | Custom timing for login steps (see below).                                                                        |
| `tasks`                 | array   | Ordered list of tasks to run after login.                                                                         |

| Key                | Type   | Description                                        |
| ------------------ | ------ | -------------------------------------------------- |
| `buttonSelector`   | string | Element to click to open the login form. Optional. |
| `usernameSelector` | string | CSS selector for the username/email input.         |
| `passwordSelector` | string | CSS selector for the password input.               |
| `submitSelector`   | string | CSS selector for the login submit button.          |

| Key             | Type   | Default | Description                                |
| --------------- | ------ | ------- | ------------------------------------------ |
| `afterClick`    | number | 1000 ms | Delay after clicking login/submit buttons. |
| `afterUsername` | number | 300 ms  | Delay after typing username.               |
| `afterPassword` | number | 300 ms  | Delay after typing password.               |

| Key                | Type   | Default | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `selector`         | string | —       | CSS selector to find the element.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `textMatch`        | string | —       | Optional text filter (case-insensitive). Matches only if element text equals this.                                                                                                                                                                                                                                                                                                                                                                                    |
| `clickType`        | string | `click` | How to perform the click: <br> - `click` → direct `.click()` <br> - `simulate` → dispatches mouse/pointer events <br> - `simulate-parent-svg` → clicks parent SVG <br> - `form-submit` → submits the parent form <br> - `keyboard` → simulates Enter key press <br> - `canvasCenter` → clicks at the center of the element’s bounding box <br> - `remove-overlay` → removes blocking overlays <br> - `remove-top-element` → removes the last/top element in `<body>`. |
                                                                                                                                                                                                                                                                                                                                                                                               |
                                                                                                                                                                                                                                                                                                                                                                                                                    |
