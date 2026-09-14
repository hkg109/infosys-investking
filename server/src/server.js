import express from 'express'

const app = express()
const port = process.env.PORT || 3000

app.use(express.json())

app.get('/api/health', (_request, response) => {
  response.status(200).json({ status: 'ok' })
})

app.listen(port, () => {
  console.log(`Infosys InvestKing server is running on port ${port}`)
})
