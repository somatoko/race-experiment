serve:
	# denon run --allow-env --allow-read --allow-net server.ts
	denon run --unstable --allow-net server.ts

experiment:
	deno run --allow-net client.ts