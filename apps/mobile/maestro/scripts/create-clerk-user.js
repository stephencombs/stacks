// A throwaway user on Clerk's development instance. Development instances never email
// `+clerk_test` addresses, and accept 424242 as their verification code.
const email = `${NAME.toLowerCase()}-${Date.now().toString(36)}+clerk_test@example.com`;
const response = http.post("https://api.clerk.com/v1/users", {
  headers: {
    Authorization: `Bearer ${CLERK_SECRET_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    email_address: [email],
    first_name: NAME,
    skip_password_requirement: true,
  }),
});
if (!response.ok)
  throw new Error(`Clerk refused the test user: ${response.status} ${response.body}`);
output.user = { id: json(response.body).id, email };
