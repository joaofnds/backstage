---
id: authorize-the-update-endpoint
title: Authorize the update endpoint
description: Authorize the update endpoint
---

When performing updates (or other operations) on specific resources, the permissions framework allows for the decision to be based on characteristics of the resource itself. This means that it's possible to write policies that (for example) allow the operation for users that own a resource, and deny the operation otherwise.

// TODO(vinzscam): remind that the plugin used in this tutorial is bringing its own types to backstage.
// for plugins relying on external entities (like catalog entities) please follow [link] tutorial.

To start with, let's edit `plugins/todo-list-backend/src/service/router.ts` in a similar way as in the previous step.

```diff
- import { todosListCreate } from './permissions';
+ import { todosListCreate, todosListUpdate } from './permissions';

  ...


    router.put('/todos', async (req, res) => {
+     const token = getBearerTokenFromAuthorizationHeader(
+       req.header('authorization'),
+     );

      if (!isTodoUpdateRequest(req.body)) {
        throw new InputError('Invalid payload');
      }
+     const decision = (
+       await permissions.authorize(
+         [{ permission: todosListUpdate, resourceRef: req.body.id }],
+         {
+           token,
+         },
+       )
+     )[0];

+     if (decision.result !== AuthorizeResult.ALLOW) {
+       throw new NotAllowedError('Unauthorized');
+     }
+
      res.json(update(req.body));
    });
```

**Important:** Notice that we are passing an extra `resourceRef` object, containing the `id` of the todo we want to authorize.

This enables decisions based on characteristics of the resource, but it's important to note that to enable authorizing multiple resources at once, **the resourceRef is not passed to PermissionPolicy#handle**. Instead, policies must return a _conditional decision_.

Before diving into the extra steps needed for supporting conditional decisions, let's go back to the permission policy's handle function used by your adopters and try to authorize our new permission.

Let's edit `packages/backend/src/plugins/permission.ts`

```diff
    if (request.permission.name === 'todos.list.create') {
      return {
        result: AuthorizeResult.DENY,
      };
    }
+   if (request.permission.resourceType === 'todo-item') {
+     if (request.permission.attributes.action === 'update') {
+       return {
+         result: AuthorizeResult.CONDITIONAL,
+         pluginId: 'todolist',
+         resourceType: 'todo-item',
+         conditions: {
+           rule: 'IS_OWNER',
+           params: [user?.identity.userEntityRef],
+         },
+       };
+     }
+   }
    return {
      result: AuthorizeResult.ALLOW,
    };
```

This is what happens when a _Conditional Decision_ is returned. We are saying:

> Hey permission framework, I can't make a decision alone. Please go to the plugin with id `todolist` and ask it to apply these conditions.

Now if we try to edit an item from the UI, we should spot the following error in the backend's console:

```
backstage error Unexpected response from plugin upstream when applying conditions.
Expected 200 but got 404 - Not Found type=errorHandler stack=Error:
Unexpected response from plugin upstream when applying conditions. Expected 200 but got 404 - Not Found
```

This happens because our plugin should have exposed a specific endpoint, used by the permission framework to apply conditional decisions. The new endpoint should also be able to support some conditions. In our case, `IS_OWNER` is the only type of condition we want to support. You can add as many built-in conditions as you like to your plugin, and you can also allow Backstage integrators to supply more conditions when starting your backend if you want.

Install the missing module:

```
$ yarn workspace @internal/plugin-todo-list-backend add @backstage/plugin-permission-node
```

Create a new `plugins/todo-list-backend/src/service/rules.ts` file and append the following code:

```typescript
import { makeCreatePermissionRule } from '@backstage/plugin-permission-node';
import { Todo, TodoFilter } from './todos';

const createTodoListPermissionRule = makeCreatePermissionRule<
  Todo,
  TodoFilter
>();

export const isOwner = createTodoListPermissionRule({
  name: 'IS_OWNER',
  description: 'Should allow only if the todo belongs to the user',
  apply: (resource: Todo, userId: string) => {
    return resource.author === userId;
  },
  toQuery: (userId: string) => {
    return {
      property: 'author',
      values: [userId],
    };
  },
});

export const rules = { isOwner };
```

`makeCreatePermissionRule` is a helper used to ensure that rules created for this plugin use consistent types for the resource and query.

We have created a new `isOwner` rule, which is going to be automatically used by the permission framework whenever a conditional response is returned in response to an authorized request with an attached `resourceRef`.
Specifically, the `apply` function is used to understand whether the passed resource should be authorized or not.

Let's skip the `toQuery` function for now.

Now, let's create the new endpoint by editing `plugins/todo-list-backend/src/service/router.ts`:

```diff
+ import { createPermissionIntegrationRouter } from '@backstage/plugin-permission-node';
- import { todosListCreate, todosListUpdate } from './permissions';
- import { add, getAll, update } from './todos';
+ import { add, getAll, getTodo, update } from './todos';
+ import { todosListCreate, todosListUpdate, TODO_LIST_RESOURCE_TYPE } from './permissions';
+ import { rules } from './rules';

  export async function createRouter(
    options: RouterOptions,
  ): Promise<express.Router> {
    const { logger, identity, permissions } = options;

+   const permissionIntegrationRouter = createPermissionIntegrationRouter({
+     getResources: async resourceRefs => {
+       return resourceRefs.map(getTodo);
+     },
+     resourceType: TODO_LIST_RESOURCE_TYPE,
+     rules: Object.values(rules),
+   });

    const router = Router();
    router.use(express.json());

+   router.use(permissionIntegrationRouter);

    router.post('/todos', async (req, res) => {
```

To check that everything works as expected, you should see an error in the UI whenever you try to edit an item that wasn’t created by you.
