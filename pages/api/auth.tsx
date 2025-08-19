import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(_: NextApiRequest, res: NextApiResponse) {
  res.setHeader('WWW-Authenticate', 'Basic realm="Dashboard", charset="UTF-8"')
  res.status(401).send('Autentikasi diperlukan untuk mengakses dashboard.');
}
