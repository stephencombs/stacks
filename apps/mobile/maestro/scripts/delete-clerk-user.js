if (output.user) {
  http.request(`https://api.clerk.com/v1/users/${output.user.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
  });
}
