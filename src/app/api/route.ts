
import {HNSWLib} from '@langchain/community/vectorstores/hnswlib'
import {BaseMessage} from '@langchain/core/messages'
import {ChatPromptTemplate} from '@langchain/core/prompts'
import {Runnable} from '@langchain/core/runnables'
import {ChatOpenAI, OpenAIEmbeddings} from '@langchain/openai'
import {StreamingTextResponse, LangChainStream} from 'ai'
import {createStuffDocumentsChain} from 'langchain/chains/combine_documents'
import {createRetrievalChain} from 'langchain/chains/retrieval'
import {Document} from 'langchain/document'
import {FunctionalTranslator, SelfQueryRetriever} from 'langchain/retrievers/self_query'
import {AttributeInfo} from 'langchain/schema/query_constructor'
import {NextResponse} from 'next/server'
import {z} from 'zod'

const QA_PROMPT_TEMPLATE = `You are a good assistant that answers questions. Your knowledge is strictly limited to the following piece of context. Use it to answer the question at the end.
  If the answer can't be found in the context, just say you don't know. *DO NOT* try to make up an answer.
  If the question is not related to the context, politely respond that you are tuned to only answer questions that are related to the context.
  Give a response in the same language as the question.
  
  Context: """"{context}"""

  Question: """{input}"""
  Helpful answer in markdown:`

type RetrievalChainType = Runnable<
  {
    input: string
    chat_history?: BaseMessage[] | string
  } & {
    [key: string]: unknown
  },
  {
    context: Document[]
    answer: any
  } & {
    [key: string]: unknown
  }
>

const getDocumentsContents = async (chain: RetrievalChainType) => {
  const result = await chain.invoke({input: "Describe what's this content about in one sentence"})
  return result.answer
}

const getSelfQueryDocs = async ({vectorStore, prompt}: {vectorStore: HNSWLib; prompt: string}) => {
  const llm = new ChatOpenAI({
    temperature: 0,
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: 'gpt-4o-mini',
  })

  const questionAnswerChain = await createStuffDocumentsChain({
    llm,
    prompt: ChatPromptTemplate.fromTemplate(QA_PROMPT_TEMPLATE),
  })

  const chain = await createRetrievalChain({
    retriever: vectorStore.asRetriever(),
    combineDocsChain: questionAnswerChain,
  })

  const documentContents = await getDocumentsContents(chain)

  if (!documentContents) {
    return []
  }

  const attributeInfo: AttributeInfo[] = [
    {
      name: 'version',
      description: 'The version number of the document, e.g., "v3.1", "4.0"',
      type: 'string',
    },
  ]

  const retriever = await SelfQueryRetriever.fromLLM({
    documentContents,
    vectorStore,
    llm,
    structuredQueryTranslator: new FunctionalTranslator(),
    attributeInfo,
  })

  const selfQueryDocsResult = await retriever.invoke(prompt)

  return selfQueryDocsResult
}

export async function POST(request: Request) {
  const body = await request.json()
  const bodySchema = z.object({
    prompt: z.string(),
  })

  const {prompt} = bodySchema.parse(body)

  try {
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
    })

    const vectorStore = await HNSWLib.load('vectorstore/rag-store.index', embeddings)

    const {stream, handlers} = LangChainStream()

    const llm = new ChatOpenAI({
      temperature: 0,
      openAIApiKey: process.env.OPENAI_API_KEY,
      streaming: true,
      modelName: 'gpt-4o-mini',
      callbacks: [handlers],
    })

    const selfQueryDocs = await getSelfQueryDocs({
      vectorStore,
      prompt,
    })

    const selfQueryRetriever = await HNSWLib.fromDocuments(selfQueryDocs, embeddings)

    const questionAnswerChain = await createStuffDocumentsChain({
      llm,
      prompt: ChatPromptTemplate.fromTemplate(QA_PROMPT_TEMPLATE),
    })

    const chain = await createRetrievalChain({
      retriever: selfQueryRetriever.asRetriever(),
      combineDocsChain: questionAnswerChain,
    })

    chain.invoke({input: prompt})

    return new StreamingTextResponse(stream)
  } catch (error) {
    console.log('error', error)
    return new NextResponse(JSON.stringify({error}), {
      status: 500,
      headers: {'content-type': 'application/json'},
    })
  }
}
