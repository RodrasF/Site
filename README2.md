# PC - Inverno 20/21 - Série de exercícios

Repositório com a resolução das séries do aluno 43499.

## Observações

* [KeyedThreadPoolExecutor](##KeyedThreadPoolExecutor) não concluído.

## Documentação técnica

* [KeyedExchanger](##KeyedExchanger)
* [BoundedCounterLatch](##BoundedCounterLatch)
* [TransferQueue](##TransferQueue)
* [KeyedThreadPoolExecutor](##KeyedThreadPoolExecutor)

---

## KeyedExchanger

O sincronizador KeyedExchanger realiza a troca de informação entre pares de *Threads* identificados com a mesma chave.

Ao realizar a chamada ao método de instância *`exchange`* começa-se por adquirir a exclusão mútua suportada por um *monitor* definido como um *`ReentrantLock`* de forma a ser possível associar várias *`Condition`* ao mesmo *monitor* e realizar notificação específica do representante que estiver envolvido na troca.

Adquirida a exclusão mútua, o primeiro passo é verificar a existência de um representante com a mesma chave da *Thread* atual já à espera e caso exista evita-se a espera da *Thread* atual simplesmente realizando logo a troca. 

A estrutura de dados ( *`requests`* ) usada para uma pesquisa por chave dos representantes em *O(1)* é um *`HashMap<Integer,Request<T>>`* sendo a chave do tipo *`Integer`*, o representante da *Thread* do tipo *`Request<T>`* e *`T`* o tipo genérico dos dados a partilhar.

Remove-se de *`requests`* o representante obtido com a chave, é initializado um *`Optional<T>`* com o valor presente no campo *`data`* do representante para ser posteriormente retornado,  *`data`* é afetado com o novo valor trazido pelo thread atual e por último altera-se o estado do representante ( *`isDone=true`* ) para significar o sucesso do trabalho antes sinalizar a sua *`Condition`* com *`signal()`*.

As `Threads` entram em espera quando não existem representantes com a mesma key que a sua aquando da verificação à entrada de *`exchange`*. Se o seu timeout for igual ou inferior a 0, é logo retornado um *`Optional`* vazio uma vez que não foi possível realizar a troca sem espera. Caso contrário, é criado um representante da Thread ( *`Request<T>`* ) contendo entre outros os dados a partilhar.

```java
static class Request<T> {
        boolean isDone = false;
        final Condition condition;
        T data;

        Request(Condition condition, T data) {
            this.condition = condition;
            this.data = data;
        }
}
```

É aberto um *`while`* com condição sempre verdadeira para suportar a saída da espera derivada de *spurious wake-ups*, dentro do qual será feita a espera da *Thread* na *`Condition`* até que seja sinalizada ou exista Timeout.

No caso de saída por interrupção, a exceção é apanhada pelo *`try catch`* envolvente de forma a que possa ser verificado se a *Thread* em questão já estava pronta para sair apesar da interrupção ( *`isDone=true`* ) e retornar na mesma o valor trocado enquanto que no caso caso de não estar ainda pronta ser preciso retirar o seu representante da *queue* antes de abandonar o método.

```java
try {
    exchangeRequest.condition.await(remaining, TimeUnit.MILLISECONDS);
} catch (InterruptedException e) {
    if (exchangeRequest.isDone) {
        Thread.currentThread().interrupt();
        return Optional.of(exchangeRequest.data);
    }
    requests.remove(key);
    throw e;
}
```

Nos restantes casos, começa-se por verificar a condição de sucesso ( *`isDone=true`* ) e retornar logo o *`Optional`* com o valor presente no campo *`data`* do representante uma vez que se *`isDone`* está a true então a troca já foi feita, o representante foi retirado da *queue* e o valor ali presente já é o novo valor.

Resta verificar o Timeout e atualizar o tempo restante para a próxima espera caso ainda sobre algum.

---

## BoundedCounterLatch

O BoundedCounterLatch utiliza tem como estado apenas duas *`Conditions`* para espera, uma para os incrementos quando *count* atinge o valor máximo e outra para o *`waitAll`*. Mantém um contador para o número de *Threads* à espera para incrementar ( *`incrementWaitCount`* ), um contador *`count`* com o valor atual de unidades e um *`maxCount`* que é final e representa o valor máximo que *`count`* pode atingir.

Utiliza ainda um campo *`waitQueue`* do tipo *`NodeLinkedList<Request>`*, sendo *`Request`* o tipo dos representantes das *Threads*, que contém todos os repsentantes das Threads que estão à espera em *`waitAll`*. Este contém apenas uma flag *`isDone`* para sinalizar o fim da espera com sucesso.

Sempre que uma *Thread* tenta realizar um incremento e não existem unidades suficientes entra em espera em *`incrementCondition`* caso o seu timeout seja maior que 0 e *`incrementWaitCount`* é incrementado.

Se a espera for terminada por interrupção, é decrementada uma unidade de *`incrementWaitCount`* para preparar a saída e é verificado se existem condições para sinalizar *`waitCondition`*, ou seja, o contador ter as unidades originais e não existirem incrementos pendentes ( *`count == 0 && incrementWaitCount == 0`* ).

Se existirem unidades livres depois da saída da espera sem exceção então é realizado o incremento de *`count`* e decrementado *`incrementWaitCount*`, uma vez que está menos uma *Thread* à esperea de realizar o incremento.

Em caso de Timeout também deve ser decrementado o contador de incrementos pendentes antes da saída do método.

O método *`decrement`* é não bloqueante, adquire apenas a exclusão mútua e realiza o decremento de *`count`* e verifica as consequentes condições de sinalização tanto para o incremento ( uma vez que passa a existir mais uma unidade livre ( *`incrementCondition.signal()`* ) como para o *`waitAll`* ( colocando o *`isDone=true`* de cada representante em espera para significar o sucesso e sinalizando depois com *`waitCondition.signalAll()`* ) já que *`count`* pode ter chegado a 0.

```java
private void signalIncrementIfNeeded() {
    if (incrementWaitCount > 0) {
        incrementCondition.signal();
    }
}

private void signalWaitIfNeeded() {
    if (count == 0 && incrementWaitCount == 0) {
        while (waitQueue.isNotEmpty()) {
            NodeLinkedList.Node<Request> node = waitQueue.pull();
            node.value.isDone = true;
        }
        waitCondition.signalAll();
    }
}
```

Com base no que foi dito anteriormente, o *`waitAll`* começa por verificar se o sincronizador já se encontra no estado pretendido ( *`count == 0 && incrementWaitCount == 0`* ) e retorna logo caso assim seja. Caso contrário, cria um representante, coloca-o na *queue* e espera.

Saída com interrupção mas já com a espera terminada ( *`isDone=true`* ) leva apenas à remoção do representante da *queue* antes da saída por exceção.

Se sai com sinalização e tem *`isDone=true`* então está pronta para retornar. Sem sucesso, verifica o *Timeout* e volta a esperar se assim for possível.

---

## TransferQueue

TransferQueue utiliza uma *queue* para os *producers*, que entregam mensagens, e outra para os *consumers*, que consomem mensagens. Ambos usam notificação específica para produtores conseguirem sinalizar um consumidor em espera quando chegam com novas mensagens e consumidores conseguirem sinalizar um produtor em espera quando estão prontos para levar as mensagens.

```java
static class Request<E> {
    boolean isDone = false;
    final Condition condition;
    E message;

    Request(Condition condition) {
        this.condition = condition;
    }

    Request(E message, Condition condition) {
        this.message = message;
        this.condition = condition;
    }
}
```

O método *`put`* verifica a existência de consumidores em espera e caso existam realiza logo a passagem da sua mensagem para o campo *`message`* do representante do consumidor que estiver à cabeça da fila de espera, retira-o dessa mesma fila e sinaliza-o. É garantido também que não existem outras mensagens à espera há mais tempo uma vez que sempre que chega um novo produtor ou consumidor é adquirida a exclusão mútua e verificadas as *queues* para uma possível troca rápida. Se a *Thread* que realizou *`put`* adquiriu a exclusão mútua e ainda existiam consumidores pendentes quer dizer que não existia mais nenhuma mensagem na fila quando entrou.

Se não existem consumidores à espera, então é criado o representante do produtor e posteriormente adicionado à queue *`producers`* sem ser necessário qualquer bloqueio da *Thread* antes de realizar o retorno.

O método *`take`* segue um caminho semelhante tirando o facto que está do lado do consumidor e não do produtor e por isso irá retornar imediatamente um representante do Resultado ( *`Result<E>`* ) sem bloquear. É um representante do resultado e não o resultado em si porque nalguns casos a mensagem não será imediatamente obtida envolvendo uma espera. Daí a existência de dois tipos diferentes de implementação do *`Result`*:

* `getCompletedResult(E message)` : Retorna um resultado que já contém a mensagem sem realizar espera no *`get()`*;

```java

 private Result<E> getCompletedResult(E message) {
    return new Result<E>() {
        @Override
        public boolean isComplete() {
            return true;
        }

        @Override
        public boolean tryCancel() {
            return false;
        }

        @Override
        public Optional<E> get(long timeout) {
            return Optional.of(message);
        }
    };
}
```

* `getResult(Node<Request<E>>)` : Retorna um resultado que pode envolver uma espera na realização do *`get`* uma vez que não existem mensagens disponíveis de momento.

O *`get`* com bloqueio espera pela chegada de um produtor carregando uma mensagem, produtor esse que irá sinalizar a *`Thread`* em espera caso o representante desta se encontre à cabeça da lista de espera de consumidores. A condição de sucesso é verificada através da flag `*isDone`*.

O método *`transfer`* é como se realiza-se um put mas sempre com espera de forma a ter a certeza que entrega a mensagem antes de retornar. Desta forma, verifica na mesma se já existe algum consumidor à espera para uma transferência rápida e caso não exista vai criar um representante, coloca-lo na lista de espera de produtores e dar *`await`* na sua condição até que seja sinalizada por um consumidor acabado de chegar pelo *`take`*.

---

## KeyedThreadPoolExecutor





