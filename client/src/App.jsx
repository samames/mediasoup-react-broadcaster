import React, { Suspense } from 'react';
import { BrowserRouter, Switch, Route } from 'react-router-dom';
import Splash from './components/Splash';
const Room = React.lazy(() => import('./components/Room'));

const App = () => {
  return (
    <>
      <BrowserRouter>
        <Switch>
          <Route path='/' exact component={Splash} />
          <Suspense fallback={<h1>Still Loading…</h1>}>
            <Route path='/room/:room/user/:user' component={Room} />
          </Suspense>
        </Switch>
      </BrowserRouter>
    </>
  );
};

export default App;
