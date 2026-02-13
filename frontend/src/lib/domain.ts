const HUB_SUFFIXES = [
  "basileus-agent.eth.limo",
  "basileus-agent.eth",
];

const HUB_DOMAINS = [
  "basileus-agent.eth.limo",
  "basileus-agent.eth",
  "basileus.reza.dev",
  "localhost",
];

export function detectAgentLabel(): string | null {
  const hostname = window.location.hostname;

  // Dev mode or known hub domains
  if (HUB_DOMAINS.some((d) => hostname === d || hostname.startsWith("localhost"))) {
    return null;
  }

  // Try stripping each suffix to find subdomain label
  for (const suffix of HUB_SUFFIXES) {
    if (hostname.endsWith(`.${suffix}`)) {
      const label = hostname.slice(0, -(suffix.length + 1));
      if (label && !label.includes(".")) return label;
    }
  }

  return null;
}
