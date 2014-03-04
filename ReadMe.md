# node-trello-slack

The built-in integration for Trello provided by Slack/SlackHQ stinks. It's limited to one board, which of course can only post activity updates to 1 channel.

This tool will check the trello api once a minute for updates and push them into your desired channels. You can configure any number of boards that you want, and each board's activity can be posted into any channel of your choosing.

## Getting access to Trello and Slack

You'll need a Trello key and token. [Get your key here](https://trello.com/1/appKey/generate): it's the one in the box near the top labeled "key." Once you have that key, substitute it into the following url for <KEY-HERE> and open it up in a browser tab:

    https://trello.com/1/connect?name=MyApp&response_type=token&expiration=never&key=<KEY-HERE>

Fill the key and token into config.json.

You'll also need your webhook token and domain name for Slack. The domain name is just the part of the url before ".slack.com." To get your token, go to the following url (substituting your domain for <YOUR-DOMAIN>) and add the webhook integration. The token will be listed in the left sidebar. Fill that into config.json as well.

## Running...

### ...locally (or where the file system is writeable)

Once you've configured access to your Trello and Slack accounts, the last thing to know is how this tool knows what events it's already seen. There are two options: File system, and Redis.

The simplest is using the file system. Just create a file named `last.id` in the root folder of the project and put the number `0` into it.

### ...on Heroku (or where the file system is not writeable)

I run this tool on Heroku (a single free dyno works great!) but it doesn't allow you to write to the file system. Instead, I use Redis. Add the free **Redis To Go** addon and everything should just work out of the box.

    heroku create
    heroku addons:add redistogo
    git push heroku master
    heroku ps:scale worker=1 && heroku logs -t

This will push whatever you've got committed in your local git repo up to a new heroku app connected to a free RedisToGo instance, running on a free Heroku worker dyno, and tail the Heroku log file -- just in case there are errors. If no errors appear after a minute or two, just hit ctrl+c to exit the log tail and go about your business.

Enjoy!

# License

This code is released under the MIT license.
