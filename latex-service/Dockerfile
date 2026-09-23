# Minimal self-hosted LaTeX compile service.
#
# Provides a CLSI-shaped REST API (POST /project/:id/compile) plus a simple
# POST /compile that returns a PDF directly. Only the TeX Live collections
# this project's generator actually needs are installed:
#   geometry, amsmath, amssymb, amsfonts, enumitem, fancyhdr,
#   booktabs, tabularx, microtype, xcolor
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      texlive-latex-base \
      texlive-latex-recommended \
      texlive-latex-extra \
      texlive-fonts-recommended \
      latexmk \
      nodejs \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Run unprivileged; TeX on arbitrary input should never be root.
RUN useradd --create-home --uid 10001 tex
WORKDIR /app
COPY --chown=tex:tex server.mjs .

USER tex
EXPOSE 3013
CMD ["node", "server.mjs"]
