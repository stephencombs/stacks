const email = `${NAME.toLowerCase()}-${Date.now().toString(36)}+clerk_test@example.com`;

const response = http.post("https://api.clerk.com/v1/users", {
  headers: {
    Authorization: `Bearer ${CLERK_SECRET_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    email_address: [email],
    first_name: NAME,
    last_name: "Test",
    skip_password_requirement: true,
  }),
});

if (!response.ok)
  throw new Error(`Clerk refused the test user: ${response.status} ${response.body}`);

output.user = { id: json(response.body).id, email };
